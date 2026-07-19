import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import ChatInterface from './ChatInterface';
import { api } from '../api';
import './BoardroomApp.css';

/**
 * CouncilApp - the original 3-stage Karpathy LLM Council, wrapped so it
 * can live alongside the Boardroom under the same mode switch.
 */
export default function CouncilApp() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    } else {
      setCurrentConversation(null);
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    try {
      setConversations(await api.listConversations());
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  };

  const loadConversation = async (id) => {
    try {
      setCurrentConversation(await api.getConversation(id));
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
  };

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, message_count: 0, title: 'New Conversation' },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;
    setIsLoading(true);
    try {
      const userMessage = { role: 'user', content };
      const assistantMessage = {
        role: 'assistant',
        stage1: null, stage2: null, stage3: null, metadata: null,
        loading: { stage1: false, stage2: false, stage3: false },
      };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage, assistantMessage],
      }));

      await api.sendMessageStream(currentConversationId, content, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            patchLast((m) => ({ ...m, loading: { ...m.loading, stage1: true } }));
            break;
          case 'stage1_complete':
            patchLast((m) => ({ ...m, stage1: event.data, loading: { ...m.loading, stage1: false } }));
            break;
          case 'stage2_start':
            patchLast((m) => ({ ...m, loading: { ...m.loading, stage2: true } }));
            break;
          case 'stage2_complete':
            patchLast((m) => ({ ...m, stage2: event.data, metadata: event.metadata, loading: { ...m.loading, stage2: false } }));
            break;
          case 'stage3_start':
            patchLast((m) => ({ ...m, loading: { ...m.loading, stage3: true } }));
            break;
          case 'stage3_complete':
            patchLast((m) => ({ ...m, stage3: event.data, loading: { ...m.loading, stage3: false } }));
            break;
          case 'title_complete':
          case 'complete':
            loadConversations();
            if (eventType === 'complete') setIsLoading(false);
            break;
          case 'error':
            console.error('Stream error:', event.message);
            setIsLoading(false);
            break;
          default:
            break;
        }
      });
    } catch (e) {
      console.error('Failed to send message:', e);
      setCurrentConversation((prev) => ({ ...prev, messages: prev.messages.slice(0, -2) }));
      setIsLoading(false);
    }
  };

  const patchLast = (fn) => {
    setCurrentConversation((prev) => {
      const messages = [...prev.messages];
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = fn(last);
      return { ...prev, messages };
    });
  };

  return (
    <div className="boardroom-app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={setCurrentConversationId}
        onNewConversation={handleNewConversation}
        variant="council"
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}
