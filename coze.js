export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持POST" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "请提供prompt参数" });

  const COZE_API_URL = "https://api.coze.cn/v3/chat";
  const COZE_API_TOKEN = process.env.COZE_API_KEY;
  const BOT_ID = process.env.COZE_BOT_ID;

  if (!COZE_API_TOKEN || !BOT_ID) {
    return res.status(500).json({ error: "服务端缺少 COZE_API_KEY 或 COZE_BOT_ID" });
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + COZE_API_TOKEN
  };

  try {
    /* 1. 发送消息 */
    const chatRes = await fetch(COZE_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        bot_id: BOT_ID,
        user_id: "user",
        stream: false,
        prompt: prompt
      })
    });
    const chatData = await chatRes.json();

    if (chatData.code !== 0) {
      return res.status(502).json({ error: "Coze调用失败: " + (chatData.msg || "unknown") });
    }

    const conversationId = chatData.data.conversation_id;
    const chatId = chatData.data.id;
    if (!conversationId || !chatId) {
      return res.status(502).json({ error: "缺少conversation_id或chat_id" });
    }

    /* 2. 轮询等待完成（Coze v3 不会直接返回回答文本） */
    if (chatData.data.status !== "completed") {
      let done = false;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 400 : 1000));
        const r = await fetch(
          "https://api.coze.cn/v3/chat/retrieve?conversation_id=" +
            encodeURIComponent(conversationId) +
            "&chat_id=" +
            encodeURIComponent(chatId),
          { headers }
        );
        const body = await r.json();
        const st = (body.data || {}).status;
        if (st === "completed") { done = true; break; }
        if (st === "failed" || st === "requires_action") {
          return res.status(502).json({ error: "对话异常: " + st });
        }
      }
      if (!done) return res.status(504).json({ error: "等待回复超时(60s)" });
    }

    /* 3. 获取回答内容 */
    const msgRes = await fetch(
      "https://api.coze.cn/v3/chat/message/list?conversation_id=" +
        encodeURIComponent(conversationId) +
        "&chat_id=" +
        encodeURIComponent(chatId),
      { headers }
    );
    const msgData = await msgRes.json();

    const answer = extractAnswer(msgData);
    res.status(200).json({ text: answer || "（未获取到回复）" });
  } catch (err) {
    res.status(500).json({ error: "API调用失败: " + err.message });
  }
}

function extractAnswer(listBody) {
  if (!listBody || listBody.code !== 0) return "";
  let rows = listBody.data;
  if (!Array.isArray(rows)) {
    if (Array.isArray((rows || {}).messages)) rows = rows.messages;
    else return "";
  }
  for (const m of rows) {
    if ((m.type || m.msg_type || "").toLowerCase() === "answer") {
      const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (c) return c;
    }
  }
  for (const m of rows) {
    if (m.role === "assistant") {
      const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (c) return c;
    }
  }
  return "";
}
