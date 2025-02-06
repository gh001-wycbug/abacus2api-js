import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { v4 as uuidv4 } from "uuid";
import { Hono } from "hono";
import { env, getRuntimeKey } from "hono/adapter";
import { handle } from "hono/vercel";
const app = new Hono();

// 定义接口
interface Message {
  role: string;
  content: string;
}

interface OpenAIRequest {
  messages: Message[];
  model: string;
  stream?: boolean;
}

interface CreateConversationRequest {
  deploymentId: string;
  name: string;
  externalApplicationId: string;
}

interface CreateConversationResponse {
  success: boolean;
  result: {
    deploymentConversationId: string;
    externalApplicationId: string;
  };
}

interface ChatConfig {
  timezone: string;
  language: string;
}

interface ChatRequest {
  requestId: string;
  deploymentConversationId: string;
  message: string;
  isDesktop: boolean;
  chatConfig: ChatConfig;
  llmName: string;
  externalApplicationId: string;
}

interface AbacusResponse {
  type: string;
  temp: boolean;
  isSpinny: boolean;
  segment: string;
  title: string;
  isGeneratingImage: boolean;
  messageId: string;
  counter: number;
  message_id: string;
  token?: string;
  end?: boolean;
  success?: boolean;
}

interface OpenAIStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    delta: {
      content: string;
    };
    index: number;
    finish_reason?: string;
  }>;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

// 设置 CORS
app.use("*", cors());

// 创建会话
async function createConversation(
  cookie: string
): Promise<CreateConversationResponse> {
  const reqBody: CreateConversationRequest = {
    deploymentId: "9077e8ef6",
    name: "New Chat",
    externalApplicationId: "beec9762a",
  };

  console.log(
    "Creating conversation with request:",
    JSON.stringify(reqBody, null, 2)
  );
  console.log("Headers:", JSON.stringify(getHeaders(cookie), null, 2));

  const response = await fetch(
    "https://pa002.abacus.ai/cluster-proxy/api/createDeploymentConversation",
    {
      method: "POST",
      headers: {
        ...getHeaders(cookie),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to create conversation:", {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });
    throw new Error(
      `Failed to create conversation: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

// 设置请求头
function getHeaders(cookie: string): Record<string, string> {
  return {
    "sec-ch-ua-platform": "Windows",
    "sec-ch-ua":
      '"Not(A:Brand";v="99", "Microsoft Edge";v="133", "Chromium";v="133"',
    "sec-ch-ua-mobile": "?0",
    "X-Abacus-Org-Host": "apps",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    "Sec-Fetch-Site": "same-site",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    host: "pa002.abacus.ai",
    Cookie: cookie,
  };
}

// 主路由处理
app.get("/", (c) => {
  return c.json({
    status: "ok",
  });
});

app.post("/v1/chat/completions", async (c) => {
  // const authHeader = c.req.header("Authorization");
  // if (!authHeader?.startsWith("Bearer ")) {
  //   throw new HTTPException(401, {
  //     message: "未提供有效的 Authorization header",
  //   });
  // }

  const cookie = `_u_p="!EUW5XKmlxoMBpcaKv/HGGrH+0m2GuE5Ra2hBXlYyAFA=?eyJ1aWQiOiA0NTM0MDMwfQ=="; _ss_p="!LvMiTyimS1iALH+b69sTjlyTLf0CKoW+Q097OVCCpBY=?eyJleHAiOiAiY29kZWxsbV91cHNlbGwifQ=="; _a_p="!btjZwmjgZUOOVxYJBrQldxjsPRV9EcIjA061+2LxcF4=?eyJ1aWQiOiAtMX0="; _s_p="!Pf39b8LpUTgDiNeO8y9b+XHRXYkaBBDnkGRgxy+ToSE=?eyJhbm9uIjogIjcwZDk3ZjgzLTU4ZTItNGUzMy1hNTc1LTA1MDUyYTkyNDQ3NiIsICJ0b2tlbiI6IG51bGwsICJmbGFnIjogImRlZmF1bHQiLCAic2Vzc2lvbl90aW1lc3RhbXAiOiAxNzM4ODQ5NTAwLjAsICJwYXNzd29yZF92ZXJzaW9uIjogMSwgInNzb19pbmZvIjoge30sICJzZXNzaW9uX2lkIjogMTAwNTY1NTB9"`;
  const body = await c.req.json<OpenAIRequest>();
  const isStream = body.stream ?? false;

  const convResp = await createConversation(cookie);

  const message = body.messages[body.messages.length - 1].content;
  const systemPrompt = body.messages.find(
    (msg) => msg.role === "system"
  )?.content;
  const contextMessages = body.messages
    .slice(0, -1)
    .filter((msg) => msg.role !== "system");

  let fullMessage = message;
  if (systemPrompt) {
    fullMessage = `System: ${systemPrompt}\n\n${message}`;
  }
  if (contextMessages.length > 0) {
    const contextStr = contextMessages
      .map((ctx) => `${ctx.role}: ${ctx.content}`)
      .join("\n");
    fullMessage = `Previous conversation:\n${contextStr}\nCurrent message: ${message}`;
  }
  const modelMapping: { [key: string]: string } = {
    "gpt-4o-mini": "OPENAI_GPT4O_MINI",
    "claude-3.5-sonnet": "CLAUDE_V3_5_SONNET",
    "o3-mini": "OPENAI_O3_MINI",
    "o3-mini-high": "OPENAI_O3_MINI_HIGH",
    "o1-mini": "OPENAI_O1_MINI",
    "deepseek-r1": "DEEPSEEK_R1",
    "gemini-2-pro": "GEMINI_2_PRO",
    "gemini-2-flash-thinking": "GEMINI_2_FLASH_THINKING",
    "gemini-2-flash": "GEMINI_2_FLASH",
    "gemini-1.5-pro": "GEMINI_1_5_PRO",
    "xai-grok": "XAI_GROK",
    "deepseek-v3": "DEEPSEEK_V3",
    "llama3-1-405b": "LLAMA3_1_405B",
    "gpt-4o": "OPENAI_GPT4O",
    // 添加更多映射
  };

  const chatReq: ChatRequest = {
    requestId: uuidv4(),
    deploymentConversationId: convResp.result.deploymentConversationId,
    message: fullMessage,
    isDesktop: true,
    chatConfig: {
      timezone: "Asia/Hong_Kong",
      language: "zh-CN",
    },
    llmName: modelMapping[body.model] || body.model,
    externalApplicationId: convResp.result.externalApplicationId,
  };

  if (isStream) {
    return streamSSE(c, async (stream) => {
      const response = await fetch(
        "https://pa002.abacus.ai/api/_chatLLMSendMessageSSE",
        {
          method: "POST",
          headers: {
            ...getHeaders(cookie),
            Accept: "text/event-stream",
            "Content-Type": "text/plain;charset=UTF-8",
          },
          body: JSON.stringify(chatReq),
        }
      );

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const abacusResp: AbacusResponse = JSON.parse(line);

              if (
                abacusResp.type === "text" &&
                abacusResp.title !== "Thinking..."
              ) {
                const streamResp: OpenAIStreamResponse = {
                  id: uuidv4(),
                  object: "chat.completion.chunk",
                  created: Date.now(),
                  model: chatReq.llmName,
                  choices: [
                    {
                      delta: {
                        content: abacusResp.segment,
                      },
                      index: 0,
                    },
                  ],
                };
                await stream.writeSSE({ data: JSON.stringify(streamResp) });
              }

              if (abacusResp.end) {
                const endResp: OpenAIStreamResponse = {
                  id: uuidv4(),
                  object: "chat.completion.chunk",
                  created: Date.now(),
                  model: chatReq.llmName,
                  choices: [
                    {
                      delta: { content: "" },
                      index: 0,
                      finish_reason: "stop",
                    },
                  ],
                };
                await stream.writeSSE({ data: JSON.stringify(endResp) });
                await stream.writeSSE({ data: "[DONE]" });
                break;
              }
            } catch (e) {
              console.error("Error parsing line:", e);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    });
  } else {
    const response = await fetch(
      "https://pa002.abacus.ai/api/_chatLLMSendMessageSSE",
      {
        method: "POST",
        headers: {
          ...getHeaders(cookie),
          Accept: "text/event-stream",
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body: JSON.stringify(chatReq),
      }
    );

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No reader available");

    const decoder = new TextDecoder();
    let content = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const abacusResp: AbacusResponse = JSON.parse(line);

            if (
              abacusResp.type === "text" &&
              abacusResp.title !== "Thinking..."
            ) {
              content += abacusResp.segment;
            }

            if (abacusResp.end) break;
          } catch (e) {
            console.error("Error parsing line:", e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const openAIResp: OpenAIResponse = {
      id: uuidv4(),
      object: "chat.completion",
      created: Date.now(),
      model: chatReq.llmName,
      choices: [
        {
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
    };

    return c.json(openAIResp);
  }
});

export default {
  port: 8787,
  fetch: app.fetch,
};
