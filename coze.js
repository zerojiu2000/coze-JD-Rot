export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持POST请求' });
  }
  try {
    const { query } = req.body;
    const response = await fetch('https://api.coze.cn/v3/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer pat_WTsqOLKwjodGmQRndjf28nnzVq5cWEyRTNjv5RQsbBtKrSTHggNMUtRs8wgirezz'
      },
      body: JSON.stringify({
        bot_id: "7639263432634122280",
        user_id: "user_123",
        conversation_id: Date.now().toString(),
        query: query,
        stream: false
      })
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: '请求失败' });
  }
}