import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
      });
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication failed' }
    });
  }
}

export async function requireCommunityRole(roles) {
  return async (req, res, next) => {
    const { communityId } = req.params;
    
    try {
      const { data: membership, error } = await supabase
        .from('community_members')
        .select('role')
        .eq('user_id', req.userId)
        .eq('community_id', communityId)
        .single();

      if (error || !membership) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member of this community' }
        });
      }

      if (!roles.includes(membership.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
        });
      }

      req.membership = membership;
      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Permission check failed' }
      });
    }
  };
}
