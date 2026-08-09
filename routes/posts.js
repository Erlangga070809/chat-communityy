import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../middleware/auth.js';
import { postLimiter } from '../middleware/rateLimit.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.get('/:communityId/posts', requireAuth, async (req, res) => {
  const { communityId } = req.params;
  const { page = 1, limit = 20, type } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('posts')
      .select(`
        *,
        community_identities!inner(anonymous_name, avatar),
        post_reactions(reaction, user_id),
        post_comments(count)
      `, { count: 'exact' })
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type && type !== 'all') {
      query = query.eq('type', type);
    }

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: error.message }
      });
    }

    res.json({
      success: true,
      data: {
        posts: data,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch posts' }
    });
  }
});

router.post('/:communityId/posts', requireAuth, postLimiter, async (req, res) => {
  const { communityId } = req.params;
  const { content, type, media_url } = req.body;

  if ((!content || !content.trim()) && !media_url) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Content or media required' }
    });
  }

  try {
    const { data: identity } = await supabase
      .from('community_identities')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', req.userId)
      .single();

    const postId = uuidv4();
    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        id: postId,
        community_id: communityId,
        author_id: req.userId,
        identity_id: identity.id,
        content: content?.trim() || '',
        type: type || 'text',
        media_url: media_url || null
      })
      .select(`
        *,
        community_identities!inner(anonymous_name, avatar)
      `)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'CREATE_ERROR', message: error.message }
      });
    }

    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Post creation failed' }
    });
  }
});

router.post('/:communityId/posts/:postId/comments', requireAuth, async (req, res) => {
  const { communityId, postId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Comment content required' }
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
      .from('post_comments')
      .insert({
        post_id: postId,
        author_id: req.userId,
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
        error: { code: 'COMMENT_ERROR', message: error.message }
      });
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Comment failed' }
    });
  }
});

router.post('/:communityId/posts/:postId/reactions', requireAuth, async (req, res) => {
  const { communityId, postId } = req.params;
  const { reaction } = req.body;

  try {
    const { data: existing } = await supabase
      .from('post_reactions')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', req.userId)
      .eq('reaction', reaction)
      .single();

    if (existing) {
      await supabase
        .from('post_reactions')
        .delete()
        .eq('id', existing.id);

      return res.json({ success: true, data: { action: 'removed' } });
    }

    await supabase
      .from('post_reactions')
      .insert({
        post_id: postId,
        user_id: req.userId,
        reaction
      });

    res.status(201).json({ success: true, data: { action: 'added' } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Reaction failed' }
    });
  }
});

router.post('/:communityId/polls', requireAuth, async (req, res) => {
  const { communityId } = req.params;
  const { question, options, allow_multiple, expires_at } = req.body;

  if (!question || !options || options.length < 2) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Question and at least 2 options required' }
    });
  }

  try {
    const { data: identity } = await supabase
      .from('community_identities')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', req.userId)
      .single();

    const pollId = uuidv4();

    const { error: pollError } = await supabase
      .from('polls')
      .insert({
        id: pollId,
        community_id: communityId,
        author_id: req.userId,
        identity_id: identity.id,
        question,
        allow_multiple: allow_multiple || false,
        expires_at: expires_at || null
      });

    if (pollError) {
      return res.status(500).json({
        success: false,
        error: { code: 'POLL_ERROR', message: pollError.message }
      });
    }

    for (const option of options) {
      await supabase
        .from('poll_options')
        .insert({
          poll_id: pollId,
          content: option
        });
    }

    res.status(201).json({ success: true, data: { id: pollId } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Poll creation failed' }
    });
  }
});

router.post('/:communityId/polls/:pollId/vote', requireAuth, async (req, res) => {
  const { communityId, pollId } = req.params;
  const { option_id } = req.body;

  try {
    const { data: poll } = await supabase
      .from('polls')
      .select('allow_multiple')
      .eq('id', pollId)
      .single();

    if (!poll.allow_multiple) {
      const { data: existing } = await supabase
        .from('poll_votes')
        .select('id')
        .eq('poll_id', pollId)
        .eq('user_id', req.userId)
        .single();

      if (existing) {
        return res.status(409).json({
          success: false,
          error: { code: 'ALREADY_VOTED', message: 'Already voted' }
        });
      }
    }

    const { error } = await supabase
      .from('poll_votes')
      .insert({
        poll_id: pollId,
        option_id,
        user_id: req.userId
      });

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'VOTE_ERROR', message: error.message }
      });
    }

    res.status(201).json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Vote failed' }
    });
  }
});

router.get('/:communityId/polls/:pollId/results', requireAuth, async (req, res) => {
  const { pollId } = req.params;

  try {
    const { data: options, error } = await supabase
      .from('poll_options')
      .select(`
        *,
        poll_votes(count)
      `)
      .eq('poll_id', pollId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: error.message }
      });
    }

    res.json({ success: true, data: options });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch results' }
    });
  }
});

export default router;
