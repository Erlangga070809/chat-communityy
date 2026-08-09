import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, requireCommunityRole } from '../middleware/auth.js';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/reports', requireAuth, async (req, res) => {
  const { target_type, target_id, reason, description } = req.body;

  if (!target_type || !target_id || !reason) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Target type, ID, and reason required' }
    });
  }

  try {
    const { data, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: req.userId,
        target_type,
        target_id,
        reason,
        description: description || '',
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'REPORT_ERROR', message: error.message }
      });
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Report failed' }
    });
  }
});

router.get('/reports', requireAuth, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
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
        reports: data,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch reports' }
    });
  }
});

router.put('/reports/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['reviewing', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid status' }
    });
  }

  try {
    const { data, error } = await supabase
      .from('reports')
      .update({
        status,
        moderator_id: req.userId,
        resolved_at: status === 'resolved' || status === 'dismissed' ? new Date().toISOString() : null
      })
      .eq('id', id)
      .select()
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
      error: { code: 'INTERNAL_ERROR', message: 'Update failed' }
    });
  }
});

router.post('/block', requireAuth, async (req, res) => {
  const { blocked_id } = req.body;

  try {
    const { data: existing } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', req.userId)
      .eq('blocked_id', blocked_id)
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_BLOCKED', message: 'User already blocked' }
      });
    }

    const { data, error } = await supabase
      .from('blocks')
      .insert({
        blocker_id: req.userId,
        blocked_id
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'BLOCK_ERROR', message: error.message }
      });
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Block failed' }
    });
  }
});

router.delete('/block/:blockedId', requireAuth, async (req, res) => {
  const { blockedId } = req.params;

  try {
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', req.userId)
      .eq('blocked_id', blockedId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'UNBLOCK_ERROR', message: error.message }
      });
    }

    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unblock failed' }
    });
  }
});

router.get('/blocks', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('blocks')
      .select(`
        blocked_id,
        profiles:blocked_id(username, display_name, avatar_url)
      `)
      .eq('blocker_id', req.userId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: error.message }
      });
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch blocks' }
    });
  }
});

router.post('/community/:communityId/moderate/:action', requireAuth, requireCommunityRole(['owner', 'admin', 'moderator']), async (req, res) => {
  const { communityId, action } = req.params;
  const { target_user_id, reason } = req.body;

  if (!target_user_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Target user required' }
    });
  }

  try {
    const { data: targetMembership } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', communityId)
      .eq('user_id', target_user_id)
      .single();

    if (!targetMembership) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found in community' }
      });
    }

    if (['owner', 'admin'].includes(targetMembership.role) && req.membership.role !== 'owner') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot moderate higher roles' }
      });
    }

    switch (action) {
      case 'kick':
        await supabase
          .from('community_members')
          .delete()
          .eq('community_id', communityId)
          .eq('user_id', target_user_id);
        break;
      case 'ban':
        await supabase
          .from('community_members')
          .delete()
          .eq('community_id', communityId)
          .eq('user_id', target_user_id);
        break;
      case 'mute':
        break;
      default:
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ACTION', message: 'Invalid moderation action' }
        });
    }

    await supabase
      .from('moderation_actions')
      .insert({
        community_id: communityId,
        moderator_id: req.userId,
        target_user_id,
        action,
        reason: reason || ''
      });

    await supabase
      .from('notifications')
      .insert({
        user_id: target_user_id,
        type: 'moderation',
        message: `You have been ${action}ed from the community`,
        data: { community_id: communityId, action, reason }
      });

    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Moderation action failed' }
    });
  }
});

export default router;
