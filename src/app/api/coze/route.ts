import { NextRequest } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;

const BOT_ID = '7639263432634122280';

export async function POST(request: NextRequest) {
  const cozeApiToken = process.env.COZE_WORKLOAD_API_TOKEN;
  if (!cozeApiToken) {
    return new Response(
      JSON.stringify({ error: '服务端缺少 COZE_WORKLOAD_API_TOKEN 环境变量，请先配置。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const cozeApiBase = process.env.COZE_API_BASE_URL || 'https://api.coze.cn';

  let body: { prompt?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: '请求体解析失败' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { prompt } = body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return new Response(
      JSON.stringify({ error: '请提供有效的 prompt 字段' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cozeApiToken}`,
    'Content-Type': 'application/json',
  };

  const extraHeaders = process.env.COZE_EXTRA_HEADERS || '';
  for (const pair of extraHeaders.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }

  const chatPayload = {
    bot_id: BOT_ID,
    user_id: 'web_user',
    stream: true,
    additional_messages: [
      {
        role: 'user' as const,
        content: prompt,
        content_type: 'text' as const,
      },
    ],
    auto_save_history: true,
  };

  try {
    const cozeResponse = await fetch(`${cozeApiBase}/v3/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(chatPayload),
    });

    if (!cozeResponse.ok) {
      const errorText = await cozeResponse.text();
      console.error('[coze-api] Coze API error:', cozeResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: `Coze API 返回错误 (${cozeResponse.status})`,
          details: errorText,
        }),
        { status: cozeResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = cozeResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        let thinkingBuffer = '';
        let answerStarted = false;
        let startTime = Date.now();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();

              if (trimmed === '') {
                currentEvent = '';
                continue;
              }

              if (trimmed.startsWith('event:')) {
                currentEvent = trimmed.slice('event:'.length).trim();
                continue;
              }

              if (trimmed.startsWith('data:')) {
                const raw = trimmed.slice('data:'.length).trim();

                if (currentEvent === 'done' || raw === '[DONE]') {
                  controller.enqueue(encoder.encode('event:done\ndata:[DONE]\n\n'));
                  continue;
                }

                try {
                  const data = JSON.parse(raw);

                  if (currentEvent === 'conversation.message.delta') {
                    if (data.reasoning_content) {
                      // 思考过程：累积但不逐字转发，避免大量小数据包
                      thinkingBuffer += data.reasoning_content;
                      // 只在思考开始时发一次通知
                      if (!answerStarted && thinkingBuffer.length <= 5) {
                        controller.enqueue(
                          encoder.encode(
                            `event:thinking_start\ndata:${JSON.stringify({ elapsed: Date.now() - startTime })}\n\n`
                          )
                        );
                      }
                    }
                    if (data.content) {
                      // 第一次收到正式回答，先一次性发送完整的思考过程
                      if (!answerStarted) {
                        answerStarted = true;
                        if (thinkingBuffer) {
                          controller.enqueue(
                            encoder.encode(
                              `event:thinking\ndata:${JSON.stringify({ content: thinkingBuffer })}\n\n`
                            )
                          );
                        }
                      }
                      controller.enqueue(
                        encoder.encode(
                          `event:answer\ndata:${JSON.stringify({ content: data.content })}\n\n`
                        )
                      );
                    }
                  } else if (currentEvent === 'conversation.message.completed') {
                    if (data.type === 'answer') {
                      controller.enqueue(
                        encoder.encode(
                          `event:answer_done\ndata:${JSON.stringify({ type: data.type, elapsed: Date.now() - startTime })}\n\n`
                        )
                      );
                    }
                  } else if (currentEvent === 'conversation.chat.completed') {
                    controller.enqueue(
                      encoder.encode(
                        `event:completed\ndata:${JSON.stringify({ chat_id: data.id, conversation_id: data.conversation_id, total_ms: Date.now() - startTime })}\n\n`
                      )
                    );
                  } else if (currentEvent === 'conversation.chat.failed') {
                    controller.enqueue(
                      encoder.encode(
                        `event:error\ndata:${JSON.stringify({ message: '对话失败，请重试' })}\n\n`
                      )
                    );
                  }
                } catch {
                  // 跳过非 JSON 行
                }
              }
            }
          }
        } catch (err) {
          console.error('[coze-api] Stream read error:', err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[coze-api] Request error:', err);
    return new Response(
      JSON.stringify({ error: '调用 Coze API 失败，请检查网络或稍后重试。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
