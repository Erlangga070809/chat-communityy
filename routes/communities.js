import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, requireCommunityRole } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', requireAuth, async (req, res) => {
  const { name, description, privacy } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Community name required' }
    });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const communityId = uuidv4();

  try {
    const { error: communityError } = await supabase
      .from('communities')
      .insert({
        id: communityId,
        name: name.trim(),
        slug,
        description: description || '',
        owner_id: req.userId,
        privacy: privacy || 'public'
      });

    if (communityError) {
      return res.status(400).json({
        success: false,
        error: { code: 'CREATE_ERROR', message: communityError.message }
      });
    }

    const { error: memberError } = await supabase
      .from('community_members')
      .insert({
        community_id: communityId,
        user_id: req.userId,
        role: 'owner'
      });

    if (memberError) {
      await supabase.from('communities').delete().eq('id', communityId);
      return res.status(500).json({
        success: false,
        error: { code: 'MEMBER_ERROR', message: 'Failed to set owner' }
      });
    }

    const anonymousName = generateAnonymousName();
    await supabase
      .from('community_identities')
      .insert({
        community_id: communityId,
        user_id: req.userId,
        anonymous_name: anonymousName
      });

    res.status(201).json({
      success: true,
      data: { id: communityId, name, slug }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Community creation failed' }
    });
  }
});

router.get('/', async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('communities')
      .select('*, community_members(count)', { count: 'exact' })
      .eq('privacy', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
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
        communities: data,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch communities' }
    });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: community, error } = await supabase
      .from('communities')
      .select('*, community_members(count)')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Community not found' }
      });
    }

    if (community.privacy === 'private') {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Private community' }
        });
      }

      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Authentication required' }
        });
      }

      const { data: membership } = await supabase
        .from('community_members')
        .select('role')
        .eq('community_id', id)
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member' }
        });
      }
    }

    res.json({ success: true, data: community });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch community' }
    });
  }
});

router.post('/:id/join', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: community } = await supabase
      .from('communities')
      .select('privacy')
      .eq('id', id)
      .single();

    if (!community) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Community not found' }
      });
    }

    const { data: existing } = await supabase
      .from('community_members')
      .select('id')
      .eq('community_id', id)
      .eq('user_id', req.userId)
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_MEMBER', message: 'Already a member' }
      });
    }

    const { error: memberError } = await supabase
      .from('community_members')
      .insert({
        community_id: id,
        user_id: req.userId,
        role: 'member'
      });

    if (memberError) {
      return res.status(500).json({
        success: false,
        error: { code: 'JOIN_ERROR', message: memberError.message }
      });
    }

    const anonymousName = generateAnonymousName();
    const { error: identityError } = await supabase
      .from('community_identities')
      .insert({
        community_id: id,
        user_id: req.userId,
        anonymous_name: anonymousName
      });

    if (identityError) {
      await supabase
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('user_id', req.userId);
      
      return res.status(500).json({
        success: false,
        error: { code: 'IDENTITY_ERROR', message: 'Failed to create identity' }
      });
    }

    res.json({ success: true, data: { anonymous_name: anonymousName } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Join failed' }
    });
  }
});

router.post('/:id/leave', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: membership } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', id)
      .eq('user_id', req.userId)
      .single();

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_MEMBER', message: 'Not a member' }
      });
    }

    if (membership.role === 'owner') {
      return res.status(400).json({
        success: false,
        error: { code: 'OWNER_CANNOT_LEAVE', message: 'Owner cannot leave. Transfer ownership or delete community.' }
      });
    }

    await supabase
      .from('community_members')
      .delete()
      .eq('community_id', id)
      .eq('user_id', req.userId);

    await supabase
      .from('community_identities')
      .delete()
      .eq('community_id', id)
      .eq('user_id', req.userId);

    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Leave failed' }
    });
  }
});

router.get('/:id/members', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { data: membership } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', id)
      .eq('user_id', req.userId)
      .single();

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not a member' }
      });
    }

    const { data, error, count } = await supabase
      .from('community_members')
      .select('user_id, role, community_identities(anonymous_name, avatar)', { count: 'exact' })
      .eq('community_id', id)
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
        members: data,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch members' }
    });
  }
});

router.put('/:id/settings', requireAuth, requireCommunityRole(['owner', 'admin']), async (req, res) => {
  const { id } = req.params;
  const { name, description, privacy, rules } = req.body;
  const updates = {};

  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (privacy !== undefined) updates.privacy = privacy;
  if (rules !== undefined) updates.rules = rules;

  try {
    const { data, error } = await supabase
      .from('communities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
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

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: membership } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', id)
      .eq('user_id', req.userId)
      .single();

    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only owner can delete community' }
      });
    }

    const { error } = await supabase
      .from('communities')
      .delete()
      .eq('id', id);

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

function generateAnonymousName() {
  const adjectives = ['Shadow', 'Silent', 'Night', 'Dark', 'Ghost', 'Cyber', 'Neon', 'Phantom', 'Crypto', 'Quantum'];
  const nouns = ['Fox', 'Byte', 'Walker', 'Wolf', 'Hawk', 'Storm', 'Cipher', 'Drift', 'Pulse', 'Blade'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

export default router;
