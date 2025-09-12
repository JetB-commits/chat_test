import React, { useState, useRef, useEffect } from 'react';
import './AzureChat.css';

function AzureChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponseId, setLastResponseId] = useState(null);

  const handleResetSession = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        'https://jetb-agent-server-281983614239.asia-northeast1.run.app/azure_agent_reset/',
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      setMessages([]);
      setLastResponseId(null);
      alert('セッションがリセットされました。');
    } catch (e) {
      console.error(e);
      alert('セッションのリセットに失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const currentInput = input;
    const userMessage = { sender: 'user', text: currentInput, id: `user-${Date.now()}` };
    setMessages((prev) => [...prev, userMessage]);

    const botMessageId = `bot-${Date.now()}`;
    const placeholderMessage = {
      id: botMessageId,
      sender: 'bot',
      text: '',
      isLoading: true,
      source: null,
      source_id: null,
      source_title: null,
      chatId: null
    };
    setMessages((prev) => [...prev, placeholderMessage]);

    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(
        'https://jetb-agent-server-281983614239.asia-northeast1.run.app/test_agent/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: currentInput,
            user_id: 7
          })
        }
      );


      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullMarkdown = '';
      let fullLogged = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const rawLine = buffer.slice(0, idx).trimEnd();
          buffer = buffer.slice(idx + 1);
          if (!rawLine) continue;

            const line = rawLine.startsWith('data:') ? rawLine.slice(5).trimStart() : rawLine;
          if (!line) continue;

          let parsed;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }

          switch (parsed.type) {
            case 'chunk':
              if (parsed.content) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === botMessageId ? { ...m, text: m.text + parsed.content } : m
                  )
                );
                fullMarkdown += parsed.content;
              }
              break;
            case 'metadata':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === botMessageId
                    ? {
                        ...m,
                        isLoading: false,
                        source: parsed.source || 'Azure OpenAI',
                        source_id: parsed.source_id || 'azure_openai',
                        source_title: parsed.source_title || 'Azure OpenAI',
                        chatId: parsed.chat_id
                      }
                    : m
                )
              );
              setLastResponseId(parsed.response_id || null);
              if (!fullLogged) {
                console.log('Full Markdown Response:', fullMarkdown);
                fullLogged = true;
              }
              break;
            case 'error':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === botMessageId
                    ? {
                        ...m,
                        isLoading: false,
                        text: `⚠️ エラー: ${parsed.content}`,
                        source: 'Error',
                        source_id: 'error'
                      }
                    : m
                )
              );
              break;
            default:
              break;
          }
        }
      }
    } catch (error) {
      let errorMessage = `❌ 接続エラーが発生しました: ${error.message}`;
      if (error.message.includes('500')) {
        errorMessage = '❌ サーバーエラー（500）: AZURE_OPENAI_MODELの設定を確認してください';
      } else if (
        error.message.includes('NetworkError') ||
        error.message.includes('Failed to fetch')
      ) {
        errorMessage = '❌ ネットワークエラー: サーバーに接続できません';
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? {
                ...m,
                isLoading: false,
                text: errorMessage,
                source: 'Error',
                source_id: 'connection_error'
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="chat-window">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender}`}>
            <div className="message-content">
              {msg.text}
              {msg.isLoading && <div className="loader" />}
            </div>
            {msg.source && msg.sender === 'bot' && (
              <div className="message-source">
                <small>Source:{msg.source_title ? msg.source_title : ''} {msg.source} ({msg.source_id}){msg.chatId}</small>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Azure OpenAIに質問を入力..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? '送信中...' : '送信'}
        </button>
      </form>

      <div className="chat-controls">
        <button
          onClick={handleResetSession}
          disabled={isLoading}
          className="reset-button"
        >
          {isLoading ? 'リセット中...' : '会話履歴をリセット'}
        </button>
        {lastResponseId && (
          <small className="response-id">Last Response ID: {lastResponseId}</small>
        )}
      </div>
    </>
  );
}

export default AzureChat;
