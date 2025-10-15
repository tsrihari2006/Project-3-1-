const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const target = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  app.use(
    ['/api', '/chat', '/chat/', '/chat-with-upload', '/chat-with-upload/', '/auth', '/auth/'],
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      ws: true,
      pathRewrite: (path) => path,
      logLevel: 'warn'
    })
  );
};

