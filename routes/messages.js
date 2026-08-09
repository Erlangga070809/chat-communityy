import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../middleware/auth.js';
import { messageLimiter } from '../middleware/rateLimit.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.get('/:communityId/messages', requireAuth, async (req, res) => {
  const { communityId } = req.params;
  const { before, limit = 50 } = req.query;

  try {
    const { data: membership } = await supabase
      .from('community_members')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', req.userId)
      .single();

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not a member' }
      });
    }

    let query = supabase
      .from('messages')
      .select(`
        *,
        community_identities!inner(anonymous_name, avatar),
        message_reactions(reaction, user_id)
      `)
      .eq('community_id', communityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: error.message }
      });
    }

    res.json({ success: true, data: data.reverse() });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch messages' }
    });
  }
});

router.post('/:communityId/messages', requireAuth, messageLimiter, async (req, res) => {
  const { communityId } = req.params;
  const { content, reply_to } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Message content required' }
    });
  }

  if (content.length > 4000) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Message too long' }
    });
  }

  try {
    const { data: membership } = await supabase
      .from('community_members')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', req.userId)
      .single();

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not a member' }
      });
    }

    const { data: identity } = await supabase
      .from('community_identities')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', req.userId)
      .single();

    const messageId = uuidv4();
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        id: messageId,
        community_id: communityId,
        sender_id: req.userId,
        identity_id: identity.id,
        content: content.trim(),
        reply_to: reply_to || null
      })
      .select(`
        *,
        community_identities!inner(anonymous_name, avatar)
      `)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'SEND_ERROR', message: error.message }
      });
    }

    if (reply_to) {
      const { data: parentMessage } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('id', reply_to)
        .single();

      if (parentMessage && parentMessage.sender_id !== req.userId) {
        await supabase
          .from('notifications')
          .insert({
            user_id: parentMessage.sender_id,
            type: 'reply',
            message: `${identity.anonymous_name} replied to your message`,
            data: { message_id: messageId, community_id: communityId }
          });
      }
    }

    const mentions = content.match(/@(\w+)/g);
    if (mentions) {
      for (const mention of mentions) {
        const username = mention.substring(1);
        const { data: mentionedUser } = await supabase
          .from('community_identities')
          .select('user_id, anonymous_name')
          .eq('community_id', communityId)
          .eq('anonymous_name', username)
          .single();

        if (mentionedUser && mentionedUser.user_id !== req.userId) {
          await supabase
            .from('notifications')
            .insert({
              user_id: mentionedUser.user_id,
              type: 'mention',
              message: `${identity.anonymous_name} mentioned you`,
              data: { message_id: messageId, community_id: communityId }
            });
        }
      }
    }

    res.status(201).json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to send message' }
    });
  }
});

router.put('/:communityId/messages/:messageId', requireAuth, async (req, res) => {
  const { communityId, messageId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Message content required' }
    });
  }

  try {
    const { data: message } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();

    if (!message) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Message not found' }
      });
    }

    if (message.sender_id !== req.userId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Can only edit own messages' }
      });
    }

    const { data, error } = await supabase
      .from('messages')
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq('id', messageId)
      .select(`
        *,
        community_identities!inner(anonymous_name, avatar)
      `)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'UPDATE_ERROR', message: error.message }
      });
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Edit failed' }
    });
  }
});

router.delete('/:communityId/messages/:messageId', requireAuth, async (req, res) => {
  const { communityId, messageId } = req.params;

  try {
    const { data: message } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();

    if (!message) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Message not found' }
      });
    }

    if (message.sender_id !== req.userId) {
      const { data: membership } = await supabase
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', req.userId)
        .single();

      if (!membership || !['owner', 'admin', 'moderator'].includes(membership.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
        });
      }
    }

    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'DELETE_ERROR', message: error.message }
      });
    }

    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Delete failed' }
    });
  }
});

router.post('/:communityId/messages/:messageId/reactions', requireAuth, async (req, res) => {
  const { communityId, messageId } = req.params;
  const { reaction } = req.body;

  if (!reaction) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Reaction required' }
    });
  }

  try {
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', req.userId)
      .eq('reaction', reaction)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existing.id);

      if (error) {
        return res.status(500).json({
          success: false,
          error: { code: 'REACTION_ERROR', message: error.message }
        });
      }

      return res.json({ success: true, data: { action: 'removed' } });
    }

    const { error } = await supabase
      .from('message_reactions')
      .insert({
        message_id: messageId,
        user_id: req.userId,
        reaction
      });

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'REACTION_ERROR', message: error.message }
      });
    }

    res.status(201).json({ success: true, data: { action: 'added' } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Reaction failed' }
    });
  }
});

router.get('/:communityId/threads/:messageId', requireAuth, async (req, res) => {
  const { communityId, messageId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('thread_messages')
      .select(`
        *,
        community_identities!inner(anonymous_name, avatar)
      `, { count: 'exact' })
      .eq('thread_id', messageId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: error.message }
      });
    }

    res.json({
      success: true,
      data: {
        messages: data,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch thread' }
    });
  }
});

router.post('/:communityId/threads/:messageId', requireAuth, async (req, res) => {
  const { communityId, messageId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Reply content required' }
    });
  }

  try {
    const { data: identity } = await supabase
      .from('community_identities')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', req.userId)
      .single();

    const { data, error } = await supabase
      .from('thread_messages')
      .insert({
        thread_id: messageId,
        community_id: communityId,
        sender_id: req.userId,
        identity_id: identity.id,
        content: content.trim()
      })
      .select(`
        *,
        community_identities!inner(anonymous_name, avatar)
      `)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'THREAD_ERROR', message: error.message }
      });
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Thread reply failed' }
    });
  }
});

export default router;
