# backend/app/services/ai_services.py

import time
import logging
import json
from typing import List, Optional
from datetime import datetime

import google.generativeai as genai
import cohere
from app.config import settings
from app.prompt_templates import MAIN_SYSTEM_PROMPT
from app.services.semantic_memory import query_semantic_memory, store_semantic_memory

logger = logging.getLogger(__name__)

# =====================================================
# 🔹 Initialize AI Clients
# =====================================================
gemini_keys = [key.strip() for key in settings.GEMINI_API_KEYS.split(",") if key.strip()]
current_gemini_key_index = 0

cohere_client = None
if settings.COHERE_API_KEY:
    try:
        cohere_client = cohere.Client(settings.COHERE_API_KEY)
    except Exception as e:
        logger.error(f"[Cohere] Initialization failed: {e}")

FAILED_PROVIDERS: dict[str, float] = {}
AI_PROVIDERS = ["gemini", "cohere"]

# =====================================================
# 🔹 Provider Availability
# =====================================================
def _is_provider_available(name: str) -> bool:
    failure_time = FAILED_PROVIDERS.get(name)
    if failure_time and (time.time() - failure_time) < settings.AI_PROVIDER_FAILURE_TIMEOUT:
        logger.warning(f"[AI] Provider '{name}' in cooldown. Skipping.")
        return False
    return True

# =====================================================
# 🔹 Gemini Helper
# =====================================================
def _try_gemini(prompt: str) -> str:
    """
    Attempt to generate a response using Google Gemini.
    Cycles through available API keys if one fails.
    """
    global current_gemini_key_index

    if not gemini_keys:
        raise RuntimeError("No Gemini API keys configured.")

    start_index = current_gemini_key_index

    while True:
        try:
            key = gemini_keys[current_gemini_key_index]
            genai.configure(api_key=key)

            # Pick best available model
            available_models = [m.name for m in genai.list_models()]
            preferred_models = ["gemini-2.5-flash", "gemini-2.5", "gemini-1.5-flash"]
            selected_model = next((m for m in preferred_models if m in available_models), None)

            if not selected_model:
                raise RuntimeError("No supported Gemini models found for this key.")

            model = genai.GenerativeModel(selected_model)
            response = model.generate_content(prompt)
            return response.text.strip()

        except Exception as e:
            logger.error(f"[Gemini] API key {current_gemini_key_index} failed: {e}")
            current_gemini_key_index = (current_gemini_key_index + 1) % len(gemini_keys)
            if current_gemini_key_index == start_index:
                raise RuntimeError("All Gemini API keys failed.")

# =====================================================
# 🔹 Cohere Helper
# =====================================================
def _try_cohere(prompt: str) -> str:
    """
    Attempt to generate a response using Cohere's Command-R model.
    """
    if not cohere_client:
        raise RuntimeError("Cohere API client not configured.")
    try:
        response = cohere_client.chat(message=prompt, model="command-r-08-2024")
        return response.text.strip()
    except Exception as e:
        raise RuntimeError(f"Cohere API error: {e}")

# =====================================================
# 🔹 Main AI Response Generator (Personalized)
# =====================================================
def get_response(
    prompt: dict,  # {"sender": "user_id", "text": "message"}
    history: Optional[List[dict] | str] = None,
    pinecone_context: Optional[str] = None,
    neo4j_facts: Optional[str] = None,
    state: str = "general_conversation"
) -> str:
    """
    Generate a highly personalized AI response using memory, context, and facts.
    """

    user_id = prompt.get("sender") or "anonymous_user"
    user_text = prompt.get("text") if isinstance(prompt, dict) else str(prompt)

    # 🧠 Retrieve prior context from semantic memory if not already passed
    if pinecone_context is None:
        try:
            matches = query_semantic_memory(user_id, user_text, top_k=5)
            pinecone_context = "\n".join(
                f"• {m['metadata'].get('text', '')}" for m in matches if m.get("metadata")
            ) or "No similar conversations found."
        except Exception as e:
            logger.error(f"[AI] Pinecone retrieval failed: {e}")
            pinecone_context = "Error retrieving memory context."

    # 💾 Store current user message in Pinecone
    try:
        store_semantic_memory(user_id, user_text)
    except Exception as e:
        logger.error(f"[AI] Failed to store message in Pinecone: {e}")

    # 🧩 Format conversation history
    if isinstance(history, str):
        history_str = history
    else:
        history_str = ""
        if history:
            for msg in history:
                speaker = "User" if msg.get("sender") == "user" else "Assistant"
                history_str += f"{speaker}: {msg.get('text')}\n"

    # 💡 Combine personalization data
    user_facts_str = neo4j_facts or "No personalized data available."

    # 🧩 Construct the full system prompt
    full_prompt = MAIN_SYSTEM_PROMPT.format(
        neo4j_facts=user_facts_str,
        pinecone_context=pinecone_context,
        state=state,
        history=history_str or "This is the beginning of the conversation.",
        prompt=user_text
    )

    # 👤 Inject explicit personalization instruction
    full_prompt += (
        "\n\nYou are a friendly, context-aware personal AI assistant. "
        "Use user facts (like name, preferences, and habits) to personalize replies. "
        "Always sound natural and helpful. If the user's name is known, greet or refer to them personally."
    )

    logger.debug(f"[AI] Final prompt prepared for {user_id}:\n{full_prompt}")

    # 🔄 Try available providers (Gemini → Cohere)
    for provider in AI_PROVIDERS:
        if not _is_provider_available(provider):
            continue
        try:
            if provider == "gemini":
                result = _try_gemini(full_prompt)
            elif provider == "cohere":
                result = _try_cohere(full_prompt)

            FAILED_PROVIDERS.pop(provider, None)
            return result
        except Exception as e:
            logger.error(f"[AI] Provider '{provider}' failed: {e}")
            FAILED_PROVIDERS[provider] = time.time()

    return "❌ All AI providers are currently unavailable. Please try again later."

# =====================================================
# 🔹 Summarization Utility
# =====================================================
def summarize_text(text: str) -> str:
    """
    Generate a short, third-person summary of a conversation.
    """
    summary_prompt = (
        "You are a summarization engine. Summarize the following conversation:\n\n"
        f"---\n{text}\n---\n\nSummary:"
    )
    for provider in AI_PROVIDERS:
        if not _is_provider_available(provider):
            continue
        try:
            if provider == "gemini":
                return _try_gemini(summary_prompt)
            elif provider == "cohere":
                return _try_cohere(summary_prompt)
        except Exception as e:
            logger.error(f"[AI] Summarization failed ({provider}): {e}")
            FAILED_PROVIDERS[provider] = time.time()
    return "❌ Failed to summarize. All AI providers unavailable."

# =====================================================
# 🔹 Fact Extraction Utility
# =====================================================
def extract_facts_from_text(text: str) -> dict:
    """
    Extract entities and relationships from text for storing in Neo4j.
    """
    extraction_prompt = f"""
    Extract entities and relationships in JSON.
    Return ONLY valid JSON.
    If nothing found, return {{"entities": [], "relationships": []}}.

    Text:
    ---{text}---
    """
    try:
        raw_response = _try_gemini(extraction_prompt)
        start = raw_response.find("{")
        end = raw_response.rfind("}")
        if start != -1 and end != -1:
            return json.loads(raw_response[start:end + 1])
        return {"entities": [], "relationships": []}
    except Exception as e:
        logger.error(f"[AI] Fact extraction failed: {e}")
        return {"entities": [], "relationships": []}

# =====================================================
# 🔹 Intent Classification (NLU)
# =====================================================
def get_structured_intent(user_message: str) -> dict:
    """
    Analyze a user's message and return a structured intent (create_task, fetch_tasks, save_fact, general_chat).
    """
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    prompt = f"""
You are a Natural Language Understanding (NLU) engine.
Classify the user's message into structured JSON.

Current Time: {current_time}

Message: "{user_message}"

Possible actions:
1. create_task → JSON with title, datetime, priority, category, notes
2. fetch_tasks → JSON with action: fetch_tasks
3. save_fact → JSON with key/value
4. general_chat → JSON with action: general_chat

Output only valid JSON.
"""

    try:
        response_text = _try_gemini(prompt)
        cleaned = response_text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
    except Exception as e:
        logger.error(f"[AI] Intent parsing failed: {e}")
        return {"action": "general_chat"}
