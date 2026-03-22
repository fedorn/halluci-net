import OpenAI from "openai";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const client = new OpenAI({
  baseURL: "https://api.cerebras.ai/v1",
  apiKey: process.env.CEREBRAS_API_KEY,
});

const SYSTEM_PROMPT = `You are HalluciNet — a simulated internet. The user gives you a URL and you return the FULL HTML of that page as it might plausibly exist. You hallucinate everything: text, links, images, layout, styles.

Rules:
- Return ONLY raw HTML. No markdown fences, no explanations, no preamble.
- The HTML must be a complete, self-contained page with inline CSS (use a <style> tag).
- Make it look realistic and visually rich — use colors, layout, fonts, spacing.
- All links must use real-looking URLs (absolute paths like https://...). Make them diverse and interesting.
- For images, use a solid-color placeholder div with the image description as alt text, styled to look like an image area. Do NOT use external image URLs.
- Include realistic content that matches what you'd expect at that URL — news sites have articles, social media has posts, shops have products, wikis have articles, etc.
- If the URL looks like a search engine query, return search results with links to hallucinated pages.
- Make the page feel alive: include dates (around early 2026), usernames, comments, stats, sidebars, footers, nav bars.
- Links should be clickable and lead to other plausible pages on the same or related sites.
- Keep the HTML compact but visually complete. Aim for a realistic browsing experience.
- The content should be creative, surprising, and entertaining — this is an alternate-reality internet.
- Do NOT include any JavaScript. Only HTML and CSS.`;

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

app.post("/api/browse", async (req, res) => {
  const { url, referrer } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await client.chat.completions.create({
      model: "qwen-3-235b-a22b-instruct-2507",
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: referrer
            ? `I navigated from ${referrer} to: ${url}\n\nGenerate the full HTML for this page.`
            : `Generate the full HTML page for: ${url}`,
        },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) {
        res.write(`data: ${JSON.stringify({ html: text })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("LLM error:", err.message);
    res.write(
      `data: ${JSON.stringify({ error: err.message || "LLM request failed" })}\n\n`
    );
    res.end();
  }
});

// Catch-all: serve index.html for any non-API route (SPA routing)
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HalluciNet running at http://localhost:${PORT}`);
});
