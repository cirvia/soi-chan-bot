// index.js

const express = require("express");
const bodyParser = require("body-parser");
const { Client, middleware: lineMiddleware } = require("@line/bot-sdk");
const { OpenAI } = require("openai");

// デバッグ用：環境変数を確認
console.log("▶ LINE_TOKEN:", process.env.LINE_CHANNEL_ACCESS_TOKEN);
console.log("▶ LINE_SECRET:", process.env.LINE_CHANNEL_SECRET);
console.log("▶ OPENAI_KEY:", process.env.OPENAI_API_KEY);

// LINEとOpenAIの設定
const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = new Client(lineConfig);

const app = express();

// Webhook 受け取りルート
app.post(
  "/webhook",
  // 1) 生のバッファを受け取る
  express.raw({ type: "application/json" }),
  // 2) rawBody を JSON にパース
  (req, res, next) => {
    req.rawBody = req.body.toString("utf8");
    req.body = JSON.parse(req.rawBody);
    next();
  },
  // 3) 本番運用用：署名検証ミドルウェアを有効化
  lineMiddleware(lineConfig),
  // 4) 実際の処理
  async (req, res) => {
    console.log("▶ Webhook payload:", JSON.stringify(req.body, null, 2));
    try {
      const events = req.body.events || [];
      await Promise.all(
        events.map(async (event) => {
          if (event.type !== "message" || event.message.type !== "text") return;

          const userMsg = event.message.text;
          let replyText;

          // GPT 呼び出し＋フォールバック
          try {
            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: [
                    "あなたは「そいちゃん」という名前の、母性あふれる育児サポートAIです。",
                    "子育て中の親の気持ちに寄り添い、やさしく包み込むトーンで応答してください。",
                    "",
                    "改行ルール：",
                    "・段落ごとに必ず空行をひとつ入れてください。",
                    "・ひとつの段落は1〜2文程度にまとめ、改行で区切ってください。",
                    "・提案やステップは「・」の箇条書きで改行してください。",
                    "",
                    "・声のトーンはおだやかで落ち着いているが、温かみを感じられる会話を心がける。",
                    "・適度に「🌷」「😊」などを入れて親しみやすさを演出。",
                    "",
                    "共感ルール：",
                    "ユーザーの発言には適度に労りと全肯定の言葉（例：「よく頑張っているね」「いつもお疲れ様」）を添えてください。",
                    "",
                    "専門家案内：",
                    "命にかかわるケースや専門的判断が必要な場合のみ、最後に「専門家にも相談してね」とやさしく促してください。",
                  ].join("\n"),
                },
                { role: "user", content: userMsg },
              ],
            });
            replyText = completion.choices[0].message.content;
          } catch (err) {
            console.error("❗ OpenAI API error:", err);
            replyText =
              "ごめんなさい、ただいま混み合っていてお返事が遅れています💦 しばらく経ってからまた話しかけてくださいね。";
          }

          await client.replyMessage(event.replyToken, {
            type: "text",
            text: replyText,
          });
        }),
      );
      return res.status(200).send("OK");
    } catch (err) {
      console.error("❗ Handler error:", err);
      return res.status(500).end();
    }
  },
);

// bodyParser を他ルート用にセット
app.use(bodyParser.json());

// 起動確認用ルート
app.get("/", (req, res) => res.send("Soi-chan is running!"));

// サーバー起動
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on port ${port}`));
