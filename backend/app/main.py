from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
import logging
import jwt

from app.services import ai_services, nlu
from app.db import utils as db_utils
from app.db.utils import create_tables, save_chat, get_chat_history, get_conversations, get_messages_by_chat, delete_task  # correct import
from app.db.neo4j_utils import save_fact_neo4j, get_fact_neo4j, get_all_facts_for_user, get_facts_neo4j
from app.db.redis_utils import save_chat_redis, get_last_chats
from app.config import settings
from app.api.auth import router as auth_router

app = FastAPI(title="Personal AI Assistant")
logger = logging.getLogger(__name__)

allowed_origins = ["http://localhost:3000", "http://localhost:5000"]
try:
    # Allow overriding CORS origins via env var, comma-separated
    extra_origins = settings.CORS_ALLOW_ORIGINS if hasattr(settings, "CORS_ALLOW_ORIGINS") else None
    if extra_origins:
        if isinstance(extra_origins, str):
            allowed_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])
        elif isinstance(extra_origins, (list, tuple)):
            allowed_origins.extend(list(extra_origins))
except Exception:
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await run_in_threadpool(create_tables)
    logger.info("✅ Tables checked/created (tasks, chat_history)")

app.include_router(auth_router)

class ChatRequest(BaseModel):
    user_message: str
    token: str
    chat_id: str | None = None
def get_current_user_id(token: str) -> int:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

@app.get("/")
async def root():
    return {"message": "🚀 Personal AI Assistant backend running!"}

@app.post("/chat/")
async def chat(request: ChatRequest):
    user_message = request.user_message
    user_id = get_current_user_id(request.token)
    chat_id = request.chat_id
    
    print(f"🔍 Chat request - user_id: {user_id}, chat_id: {chat_id}, message: {user_message[:50]}...")
    
    try:
        # ---------- Determine intent ----------
        structured = nlu.get_structured_intent(user_message)
        action = structured.get("action")

        # ---------- Fetch global context ----------
        # 1️⃣ Build history text from DB by chat_id if provided; fallback to recent chats
        history_text = ""
        if chat_id:
            msgs = await run_in_threadpool(get_messages_by_chat, user_id, chat_id, 50)
            history_text = "\n".join([f"{'Human' if m['sender']=='user' else 'Assistant'}: {m['content']}" for m in msgs])
        else:
            extra_chats = await run_in_threadpool(get_chat_history, user_id, 10)
            history_text = "\n".join([f"Human: {c['user_query']}\nAssistant: {c['ai_response']}" for c in extra_chats])

        # 3️⃣ Fetch all facts from Neo4j
        facts_list = await run_in_threadpool(get_facts_neo4j, user_id)
        facts_text = "\n".join([f"{fact['key']}: {fact['value']}" for fact in facts_list])

        # ---------- Handle actions ----------
        if action == "general_chat":
            # ✅ Wrap message in dict to avoid 'str' object has no attribute 'get'
            user_msg_dict = {"sender": str(user_id), "text": user_message}
            response = await run_in_threadpool(
                ai_services.get_response,
                user_msg_dict,
                history=history_text,
                neo4j_facts=facts_text
            )

            # Save chat for this user
            await run_in_threadpool(save_chat, user_id, user_message, response, chat_id)
            await run_in_threadpool(save_chat_redis, user_id, user_message, response, chat_id)

            return {"success": True, "reply": response, "intent": structured}

        elif action == "create_task":
            # attach user_id
            data_with_user = {**structured["data"], "user_id": user_id}
            await run_in_threadpool(db_utils.save_task, data_with_user)
            confirmation_message = f"Task saved: {structured['data']['title']} due {structured['data']['datetime']}"

            await run_in_threadpool(save_chat, user_id, user_message, confirmation_message)
            await run_in_threadpool(save_chat_redis, user_id, user_message, confirmation_message)

            return {"success": True, "reply": confirmation_message, "status": "✅ Task saved", "task": structured["data"]}

        elif action == "fetch_tasks":
            tasks = await run_in_threadpool(db_utils.get_tasks, user_id)
            tasks_summary = f"You have {len(tasks)} tasks."

            # ✅ Wrap summary in dict for AI service
            tasks_msg_dict = {"sender": str(user_id), "text": tasks_summary}
            ai_reply = await run_in_threadpool(
                ai_services.get_response,
                tasks_msg_dict,
                history=history_text,
                neo4j_facts=facts_text
            )

            return {"success": True, "reply": ai_reply, "tasks": tasks, "intent": structured}

        elif action == "save_fact":
            key = structured["data"]["key"]
            value = structured["data"]["value"]
            await run_in_threadpool(save_fact_neo4j, key, value)

            confirmation_message = f"I have saved the fact '{key}: {value}' in your knowledge base."
            confirm_msg_dict = {"sender": str(user_id), "text": confirmation_message}  # ✅ wrapped
            ai_reply = await run_in_threadpool(
                ai_services.get_response,
                confirm_msg_dict,
                history=history_text,
                neo4j_facts=facts_text
            )

            return {"success": True, "reply": ai_reply, "intent": structured}

        elif action == "get_chat_history":
            # Return last 10 chats from Redis globally
            history = await run_in_threadpool(get_last_chats, user_id)
            return {"success": True, "history": history, "intent": structured}

        else:
            return {"success": False, "reply": "⚠ Unknown action", "intent": structured}

    except Exception as e:
        logger.exception(f"Chat endpoint failed: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.get("/api/tasks")
async def api_get_tasks(token: str):
    try:
        user_id = get_current_user_id(token)
        tasks = await run_in_threadpool(db_utils.get_tasks, user_id)
        formatted_tasks = [
            {
                "id": row["id"],
                "title": row["title"],
                "datetime": row["datetime"].isoformat() if row["datetime"] else None,
                "priority": row["priority"],
                "category": row["category"],
                "notes": row["notes"],
                "notified": row["notified"]
            }
            for row in tasks
        ]
        return {"success": True, "tasks": formatted_tasks}
    except Exception as e:
        logger.exception(f"Error fetching tasks: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch tasks")


@app.delete("/api/tasks/{task_id}")
async def api_delete_task(task_id: int, token: str):
    try:
        user_id = get_current_user_id(token)
        success = await run_in_threadpool(delete_task, user_id, task_id)
        if success:
            return {"success": True, "message": "Task deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Task not found")
    except Exception as e:
        logger.exception(f"Error deleting task: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete task")


@app.get("/api/conversations")
async def api_get_conversations(token: str):
    try:
        user_id = get_current_user_id(token)
        convos = await run_in_threadpool(get_conversations, user_id)
        return {"success": True, "conversations": convos}
    except Exception as e:
        logger.exception(f"Error fetching conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch conversations")


@app.get("/api/conversations/{chat_id}")
async def api_get_messages(chat_id: str, token: str):
    try:
        user_id = get_current_user_id(token)
        messages = await run_in_threadpool(get_messages_by_chat, user_id, chat_id, 500)
        return {"success": True, "messages": messages}
    except Exception as e:
        logger.exception(f"Error fetching messages: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch messages")


@app.post("/chat-with-upload/")
async def chat_with_upload(
    file: UploadFile = File(...),
    prompt: str = Form(...),
    token: str = Form(...),
    chat_id: str | None = Form(default=None)
):
    try:
        user_id = get_current_user_id(token)

        # Parse prompt JSON {"sender": ..., "text": ...}
        try:
            import json
            prompt_obj = json.loads(prompt) if isinstance(prompt, str) else prompt
            user_text = prompt_obj.get("text") if isinstance(prompt_obj, dict) else str(prompt)
        except Exception:
            user_text = str(prompt)

        # We don't process the file contents in this stub; ensure read to avoid warnings
        await file.read()  # discard

        # Create a simple response using AI service context if available
        user_msg_dict = {"sender": str(user_id), "text": user_text}
        ai_reply = await run_in_threadpool(
            ai_services.get_response,
            user_msg_dict,
            history="",
            neo4j_facts=""
        )

        # Save entries
        await run_in_threadpool(save_chat, user_id, user_text, ai_reply, chat_id)
        await run_in_threadpool(save_chat_redis, user_id, user_text, ai_reply, chat_id)

        return {"success": True, "response": ai_reply}
    except Exception as e:
        logger.exception(f"Upload chat failed: {e}")
        raise HTTPException(status_code=500, detail="Upload chat failed")
