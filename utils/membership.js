function toText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function normalizeMembershipTier(value, isMember) {
  const tier = toText(value).toLowerCase();
  if (tier === 'pro' || tier === 'max') {
    return tier;
  }
  return Number(isMember || 0) === 1 ? 'pro' : '';
}

function buildMembershipState(user) {
  const data = user && typeof user === 'object' ? user : {};
  const isMember = Number(data.membership_active || data.is_member || 0) === 1;
  const tier = normalizeMembershipTier(data.membership_tier, isMember);
  return {
    isMember: isMember,
    isPro: tier === 'pro',
    isMax: tier === 'max',
    tier: tier,
    label: tier === 'max' ? 'Max' : tier === 'pro' ? 'Pro' : '普通用户'
  };
}

function resolveGrowthMeta(tier) {
  if (tier === 'max') {
    return {
      bonus: '+9000',
      multiplier: '1.35x'
    };
  }
  if (tier === 'pro') {
    return {
      bonus: '+3000',
      multiplier: '1.15x'
    };
  }
  return {
    bonus: '+0',
    multiplier: '1.00x'
  };
}

function resolveMembershipTermText(user) {
  const daysLeft = Number(user && user.membership_days_left || 0);
  if (daysLeft > 0) {
    return '剩余 ' + daysLeft + ' 天';
  }
  return '按后台时长生效';
}

function buildMineFeatureCards(user) {
  const state = buildMembershipState(user);
  const proGrowth = resolveGrowthMeta('pro');
  const maxGrowth = resolveGrowthMeta('max');
  return [{
    key: 'pro_rights',
    tone: state.isMember ? 'pro' : 'base',
    badge: state.isMember ? 'PRO 已解锁' : 'PRO 权益',
    title: 'Pro 会员能力',
    desc: state.isMember
      ? '已解锁会员身份展示、建圈权限和基础创作支持，会员有效期内还能持续获得成长值加速。'
      : '开通 Pro 后可解锁会员身份展示、建圈权限和基础创作支持，并附带成长值加速。',
    entries: [{
      title: '身份展示',
      value: state.isMember ? '已解锁' : '开通后可用'
    }, {
      title: '建圈权限',
      value: state.isMember ? '可直接使用' : 'Pro 可用'
    }, {
      title: '成长加速',
      value: proGrowth.multiplier
    }, {
      title: '有效期',
      value: state.isMember ? resolveMembershipTermText(user) : '按后台时长生效'
    }],
    buttonText: state.isMember ? '前往建圈' : '开通 Pro',
    action: state.isMember ? 'create_circle' : 'open_membership',
    scene: 'mine_pro'
  }, {
    key: 'max_rights',
    tone: state.isMax ? 'max' : 'upgrade',
    badge: state.isMax ? 'MAX 专属' : 'MAX 升级',
    title: 'Max 优先入口',
    desc: state.isMax
      ? '专题提报、圈子运营支持和更高优先级客服入口都已经为你开放，同时享受更高成长值加速。'
      : '升级 Max 后可获得专题提报、运营支持、更高优先级支持入口和更高成长值加速。',
    entries: [{
      title: '专题提报',
      value: state.isMax ? '已解锁' : '升级后开放'
    }, {
      title: '优先支持',
      value: state.isMax ? '专属通道' : 'Max 可用'
    }, {
      title: '成长加速',
      value: maxGrowth.multiplier
    }, {
      title: '开通奖励',
      value: maxGrowth.bonus
    }],
    buttonText: state.isMax ? '发起支持' : '升级 Max',
    action: state.isMax ? 'open_max_support' : 'open_membership',
    scene: 'max_mine'
  }];
}

function buildPostPrompt(user) {
  const state = buildMembershipState(user);
  if (state.isMax) {
    return {
      tone: 'max',
      badge: 'MAX 发布权益',
      title: '已解锁 Max 专属提报入口',
      desc: '发布内容后，如需专题提报、运营协助或优先支持，可以直接从这里发起；会员有效期内还会持续提供更高成长值加速。',
      entries: [{
        title: '内容提报',
        value: '已解锁'
      }, {
        title: '优先支持',
        value: '实时可发起'
      }, {
        title: '成长加速',
        value: '1.35x'
      }],
      buttonText: '发起提报',
      action: 'open_max_support',
      scene: 'max_post'
    };
  }
  if (state.isMember) {
    return {
      tone: 'pro',
      badge: 'PRO 已开通',
      title: '已解锁会员身份展示',
      desc: '当前可以正常发布内容；Pro 有效期内会持续提供成长值加速，升级 Max 后可进入专题提报与更高优先级支持入口。',
      entries: [{
        title: '身份展示',
        value: '已解锁'
      }, {
        title: '内容提报',
        value: '升级 Max 后可用'
      }, {
        title: '成长加速',
        value: '1.15x'
      }],
      buttonText: '升级 Max',
      action: 'open_membership',
      scene: 'post_pro'
    };
  }
  return {
    tone: 'base',
    badge: '会员入口',
    title: '发布时也能继续升级权益',
    desc: '当前可正常发布内容；开通 Pro 可解锁会员身份展示并加速成长值，升级 Max 可进入专题提报与优先支持入口。',
    entries: [{
      title: '身份展示',
      value: '开通 Pro 解锁'
    }, {
      title: '内容提报',
      value: '升级 Max 解锁'
    }, {
      title: '成长加速',
      value: 'Pro 1.15x / Max 1.35x'
    }],
    buttonText: '查看会员',
    action: 'open_membership',
    scene: 'post_base'
  };
}

function buildCirclePrompt(user) {
  const state = buildMembershipState(user);
  if (state.isMax) {
    return {
      tone: 'max',
      badge: 'MAX 圈子权限',
      title: '已解锁建圈与专属支持入口',
      desc: '当前账号已可建圈，并可通过 Max 通道发起圈子专题合作、运营支持或优先客服；会员有效期内还会持续享受更高成长值加速。',
      entries: [{
        title: '建圈权限',
        value: '已解锁'
      }, {
        title: '圈子支持',
        value: '专属通道'
      }, {
        title: '成长加速',
        value: '1.35x'
      }],
      buttonText: '发起支持',
      action: 'open_max_support',
      scene: 'max_circle',
      gateTitle: '建圈已解锁',
      gateContent: '当前账号已是 Max，可直接建圈；如需专题合作或运营支持，可使用 Max 专属入口。'
    };
  }
  if (state.isMember) {
    return {
      tone: 'pro',
      badge: 'PRO 建圈权限',
      title: '已解锁建圈能力',
      desc: '当前账号已经可以建圈；Pro 有效期内会持续提供成长值加速，升级 Max 后可获得圈子专题提报与更高优先级支持入口。',
      entries: [{
        title: '建圈权限',
        value: '已解锁'
      }, {
        title: '圈子支持',
        value: '升级 Max 后可用'
      }, {
        title: '成长加速',
        value: '1.15x'
      }],
      buttonText: '升级 Max',
      action: 'open_membership',
      scene: 'circle_pro',
      gateTitle: '建圈已解锁',
      gateContent: '当前账号已开通 Pro，可以直接创建圈子；升级 Max 可获得圈子专题提报与优先支持入口。'
    };
  }
  return {
    tone: 'base',
    badge: 'PRO 建圈权限',
    title: '建圈需要 Pro',
    desc: '开通 Pro 可立即解锁建圈并加速成长值；升级 Max 还可获得圈子专题合作与更高优先级支持入口。',
    entries: [{
      title: '建圈权限',
      value: '开通 Pro 解锁'
    }, {
      title: '圈子支持',
      value: '升级 Max 解锁'
    }, {
      title: '成长加速',
      value: 'Pro 1.15x / Max 1.35x'
    }],
    buttonText: '开通会员',
    action: 'open_membership',
    scene: 'circle_base',
    gateTitle: '建圈提示',
    gateContent: '建圈功能属于 Pro 会员能力，升级 Max 还可获得专题合作与更高优先级支持入口。'
  };
}

function buildSupportPrefill(scene) {
  switch (scene) {
    case 'max_post':
      return '【Max内容提报】我想为以下内容申请专题提报或运营支持：';
    case 'max_circle':
      return '【Max圈子支持】我想为当前圈子申请专题合作或运营支持：';
    default:
      return '【Max会员支持】我想咨询当前账号的专属权益或发起支持申请：';
  }
}

function buildMaxSupportRoute(scene) {
  const supportScene = toText(scene) || 'max_mine';
  const prefill = buildSupportPrefill(supportScene);
  return '/pages/mine/feedback/feedback?scene=' + encodeURIComponent(supportScene) + '&type=1&prefill=' + encodeURIComponent(prefill);
}

function resolveMembershipActionRoute(action, scene) {
  switch (action) {
    case 'create_circle':
      return '/pages/circle/creat?type=0';
    case 'open_max_support':
      return buildMaxSupportRoute(scene);
    case 'open_membership':
    default:
      return '/pages/mine/members/members';
  }
}

module.exports = {
  buildMembershipState: buildMembershipState,
  buildMineFeatureCards: buildMineFeatureCards,
  buildPostPrompt: buildPostPrompt,
  buildCirclePrompt: buildCirclePrompt,
  resolveMembershipActionRoute: resolveMembershipActionRoute
};
