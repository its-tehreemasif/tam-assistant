const axios = require('axios');

/**
 * AI Manager — Handles Groq AI conversations with per-user context
 * Supports conversation history, model info, and graceful error handling.
 */
class AIManager {
    constructor(apiKey, systemPrompt) {
        this.apiKey = apiKey;
        this.systemPrompt = systemPrompt;
        this.conversations = new Map();
        this.maxHistory = 10;
        this.model = 'llama-3.3-70b-versatile';
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        this.callCount = 0;
    }

    getConversation(userId) {
        if (!this.conversations.has(userId)) {
            this.conversations.set(userId, []);
        }
        return this.conversations.get(userId);
    }

    addToHistory(userId, role, content) {
        const history = this.getConversation(userId);
        history.push({ role, content });
        if (history.length > this.maxHistory * 2) {
            history.splice(0, 2);
        }
    }

    resetConversation(userId) {
        this.conversations.delete(userId);
        return true;
    }

    getHistoryLength(userId) {
        return this.getConversation(userId).length;
    }

    async chat(userId, message) {
        try {
            this.addToHistory(userId, 'user', message);
            const history = this.getConversation(userId);
            this.callCount++;

            const response = await axios.post(
                this.apiUrl,
                {
                    model: this.model,
                    messages: [
                        { role: 'system', content: this.systemPrompt },
                        ...history
                    ],
                    temperature: 0.7,
                    max_tokens: 4096,
                    top_p: 1,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const aiMessage = response.data.choices[0].message.content;
            this.addToHistory(userId, 'assistant', aiMessage);

            return { success: true, message: aiMessage };
        } catch (error) {
            const errMsg = error.response?.data?.error?.message || error.message;
            console.error('[AI] Error:', errMsg);
            return { success: false, error: errMsg };
        }
    }

    getHistory(userId) {
        return this.conversations.get(userId) || [];
    }

    getInfo() {
        return {
            model: this.model,
            totalCalls: this.callCount,
            activeConversations: this.conversations.size
        };
    }
}

module.exports = AIManager;
