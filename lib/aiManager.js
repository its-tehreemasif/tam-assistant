const axios = require('axios');

/**
 * AI Manager - Handles Groq AI conversations with per-user context
 * Specially tuned for TAM Personal Assistant
 */
class AIManager {
    constructor(apiKey, systemPrompt) {
        this.apiKey = apiKey;
        this.systemPrompt = systemPrompt;
        this.conversations = new Map(); // userId -> [{role, content}]
        this.maxHistory = 8;
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
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

    async chat(userId, message) {
        try {
            this.addToHistory(userId, 'user', message);
            const history = this.getConversation(userId);

            const messages = [
                {
                    role: 'system',
                    content: this.systemPrompt
                },
                ...history
            ];

            const response = await axios.post(
                this.apiUrl,
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 4096,
                    top_p: 1,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const aiMessage = response.data.choices[0].message.content;
            this.addToHistory(userId, 'assistant', aiMessage);

            return {
                success: true,
                message: aiMessage
            };
        } catch (error) {
            console.error('[AI-ASSISTANT] Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error?.message || error.message
            };
        }
    }
}

module.exports = AIManager;
