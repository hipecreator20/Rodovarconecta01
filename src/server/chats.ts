import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { resolveDataRoot } from './dataRoot.ts';
import { persistChatMessageToNeon, persistStateSnapshotToNeon } from '../../neon.ts';

export function registerChats(app: Express, guard: any, dbState: any) {
  const dataDir = path.join(resolveDataRoot(), 'data');
  const chatFile = path.join(dataDir, 'chats-store.json');

  let chatsState: { threads: any[]; keys: Record<string, string> } = {
    threads: [],
    keys: {},
  };

  if (fs.existsSync(chatFile)) {
    try {
      chatsState = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
    } catch {}
  }

  const saveChats = () => {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(chatFile, JSON.stringify(chatsState, null, 2), 'utf8');
      void persistStateSnapshotToNeon('rodovar-chats', chatsState);
    } catch (err) {
      console.warn('Chat persistence warning:', (err as Error).message);
    }
  };

  // Get all chat threads for the current user
  app.get('/api/chats', guard, (req: any, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      threads: chatsState.threads || [],
    });
  });

  // Post a message in a chat thread
  app.post('/api/chats/:threadId/messages', guard, (req: any, res) => {
    const threadId = req.params.threadId;
    const { text, attachment, attachmentSize, extra } = req.body || {};
    const user = req.sessionUser;

    if (!text && !attachment) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    let thread = chatsState.threads.find((t: any) => t.id === threadId);
    if (!thread) {
      thread = {
        id: threadId,
        participantId: threadId,
        name: threadId.startsWith('g-') ? 'Canal Geral' : 'Conversa Corporativa',
        role: 'Colaborador',
        avatar: '/assets/aistudio/RODOVAR-LOGO_310056c8.png',
        online: true,
        unreadCount: 0,
        messages: [],
      };
      chatsState.threads.push(thread);
    }

    const nowStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const msgId = `m-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    const newMsg = {
      id: msgId,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.roleTitle || user.accessLevel,
      text: String(text || '').slice(0, 4000),
      timestamp: nowStr,
      status: 'delivered',
      attachment: attachment ? String(attachment).slice(0, 200) : undefined,
      attachmentSize: attachmentSize ? String(attachmentSize).slice(0, 30) : undefined,
      mediaType: extra?.mediaType,
      mediaUrl: extra?.mediaUrl,
      audioDuration: extra?.audioDuration,
      forwardedFrom: extra?.forwardedFrom,
    };

    thread.messages.push(newMsg);
    saveChats();

    void persistChatMessageToNeon({
      id: msgId,
      threadId,
      senderId: user.id,
      senderName: user.name,
      text: newMsg.text || 'Anexo compartilhado',
    });

    res.status(201).json({
      ok: true,
      message: newMsg,
      thread,
    });
  });

  // Create a new corporate group
  app.post('/api/chats/groups', guard, (req: any, res) => {
    const { name, description, memberIds } = req.body || {};
    const user = req.sessionUser;

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Nome do grupo obrigatório.' });
    }

    const groupId = `g-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const newGroup = {
      id: groupId,
      name: String(name).trim().slice(0, 100),
      description: description ? String(description).slice(0, 255) : '',
      avatar: '/assets/aistudio/RODOVAR-LOGO_310056c8.png',
      isGroup: true,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      memberIds: Array.isArray(memberIds) ? memberIds : [user.id],
      unreadCount: 0,
      messages: [],
    };

    chatsState.threads.unshift(newGroup);
    saveChats();

    res.status(201).json({
      ok: true,
      group: newGroup,
    });
  });
}
