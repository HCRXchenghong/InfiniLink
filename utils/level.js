const LEVEL_THEME_DEFINITIONS = [{
  level_no: 1,
  level_label: 'LV1',
  level_name: '新芽',
  level_aura: '启程身份',
  level_subtitle: '刚进入社区的起步阶段，完成基础登录与停留后即可稳定拥有。',
  level_hint: '以基础在线和浏览行为为主，适合刚开始建立使用习惯的用户。',
  colors: {
    from: '#334155',
    to: '#64748b',
    border: 'rgba(226, 232, 240, 0.46)',
    shadow: 'rgba(15, 23, 42, 0.18)',
    text: '#f8fafc',
    muted: 'rgba(248, 250, 252, 0.84)'
  }
}, {
  level_no: 2,
  level_label: 'LV2',
  level_name: '行者',
  level_aura: '稳定活跃',
  level_subtitle: '开始形成稳定在线与浏览习惯，社区存在感会逐渐清晰起来。',
  level_hint: '需要持续回访与日常停留，升级难度已明显高于入门阶段。',
  colors: {
    from: '#075985',
    to: '#0ea5e9',
    border: 'rgba(186, 230, 253, 0.48)',
    shadow: 'rgba(2, 132, 199, 0.20)',
    text: '#f8fafc',
    muted: 'rgba(240, 249, 255, 0.84)'
  }
}, {
  level_no: 3,
  level_label: 'LV3',
  level_name: '旅人',
  level_aura: '互动积累',
  level_subtitle: '已经建立基础互动节奏，浏览之外的活跃行为开始变得重要。',
  level_hint: '单靠停留不再够用，需要更多真实互动来维持成长速度。',
  colors: {
    from: '#065f46',
    to: '#10b981',
    border: 'rgba(167, 243, 208, 0.46)',
    shadow: 'rgba(5, 150, 105, 0.22)',
    text: '#ecfdf5',
    muted: 'rgba(236, 253, 245, 0.84)'
  }
}, {
  level_no: 4,
  level_label: 'LV4',
  level_name: '领航',
  level_aura: '内容参与',
  level_subtitle: '需要更持续的参与与贡献，已经不是轻度使用就能自然抵达的等级。',
  level_hint: '评论、点赞和活跃停留都要同步拉起来，门槛开始进入进阶区间。',
  colors: {
    from: '#92400e',
    to: '#f59e0b',
    border: 'rgba(253, 230, 138, 0.50)',
    shadow: 'rgba(217, 119, 6, 0.22)',
    text: '#fffbeb',
    muted: 'rgba(255, 251, 235, 0.84)'
  }
}, {
  level_no: 5,
  level_label: 'LV5',
  level_name: '耀星',
  level_aura: '高频用户',
  level_subtitle: '长期活跃与明显存在感的分界线，已经具备较强的社区辨识度。',
  level_hint: '需要连续活跃和稳定互动沉淀，已经不是短期冲刺就能轻松达成。',
  colors: {
    from: '#9f1239',
    to: '#fb7185',
    border: 'rgba(254, 205, 211, 0.48)',
    shadow: 'rgba(225, 29, 72, 0.22)',
    text: '#fff1f2',
    muted: 'rgba(255, 241, 242, 0.84)'
  }
}, {
  level_no: 6,
  level_label: 'LV6',
  level_name: '主理',
  level_aura: '圈层骨干',
  level_subtitle: '来到这一层的用户，通常已经具备高频创作、运营或深度使用特征。',
  level_hint: '难度进入高阶段位，长期沉淀和会员加成都会开始变得更有价值。',
  colors: {
    from: '#312e81',
    to: '#6366f1',
    border: 'rgba(199, 210, 254, 0.48)',
    shadow: 'rgba(79, 70, 229, 0.24)',
    text: '#eef2ff',
    muted: 'rgba(238, 242, 255, 0.84)'
  }
}, {
  level_no: 7,
  level_label: 'LV7',
  level_name: '天穹',
  level_aura: '高阶身份',
  level_subtitle: '深度参与者才会抵达的稀有等级，成长曲线已经明显变慢。',
  level_hint: '需要长周期活跃、内容参与和更真实的用户行为沉淀才能维持上升。',
  colors: {
    from: '#134e4a',
    to: '#14b8a6',
    border: 'rgba(153, 246, 228, 0.48)',
    shadow: 'rgba(13, 148, 136, 0.24)',
    text: '#f0fdfa',
    muted: 'rgba(240, 253, 250, 0.84)'
  }
}, {
  level_no: 8,
  level_label: 'LV8',
  level_name: '圣曜',
  level_aura: '尊享身份',
  level_subtitle: '升级难度已进入极少数用户区间，需要长期高频使用与显著贡献。',
  level_hint: '会员助力、长期留存和高质量互动会成为这一层继续突破的关键。',
  colors: {
    from: '#581c87',
    to: '#a855f7',
    border: 'rgba(233, 213, 255, 0.48)',
    shadow: 'rgba(147, 51, 234, 0.24)',
    text: '#faf5ff',
    muted: 'rgba(250, 245, 255, 0.84)'
  }
}, {
  level_no: 9,
  level_label: 'LV9',
  level_name: '冠冕',
  level_aura: '核心荣誉',
  level_subtitle: '属于少数核心用户的荣耀位阶，已经具备非常强的社区影响力与沉淀。',
  level_hint: '门槛极高，只有持续深度参与并长期累积成长值的用户才能触达。',
  colors: {
    from: '#7f1d1d',
    to: '#f97316',
    border: 'rgba(254, 215, 170, 0.52)',
    shadow: 'rgba(194, 65, 12, 0.26)',
    text: '#fff7ed',
    muted: 'rgba(255, 247, 237, 0.84)'
  }
}, {
  level_no: 10,
  level_label: 'LV10',
  level_name: '无界',
  level_aura: '巅峰荣誉',
  level_subtitle: 'InfiniLink 当前最高等级，象征长期沉淀、稀缺身份与顶级尊贵感。',
  level_hint: '这是全站顶级荣誉区间，成长值要求极高，适合长期深度用户与核心贡献者。',
  colors: {
    from: '#111827',
    to: '#b45309',
    border: 'rgba(253, 230, 138, 0.62)',
    shadow: 'rgba(180, 83, 9, 0.28)',
    text: '#fffbeb',
    muted: 'rgba(255, 251, 235, 0.84)'
  }
}];

function clampLevelNo(value) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.min(LEVEL_THEME_DEFINITIONS.length, Math.floor(numeric)));
}

function buildGradient(colors) {
  return 'linear-gradient(135deg, ' + colors.from + ' 0%, ' + colors.to + ' 100%)';
}

function joinStyles(parts) {
  return parts.filter(Boolean).join('');
}

function withThemeStyles(theme) {
  const colors = theme.colors || {};
  const background = buildGradient(colors);
  return Object.assign({}, theme, {
    level_theme_class: 'level-theme-' + theme.level_no,
    level_badge_text: theme.level_label,
    level_badge_style: joinStyles([
      'background:' + background + ';',
      'border:1px solid ' + colors.border + ';',
      'color:' + colors.text + ';',
      'box-shadow:0 10rpx 24rpx ' + colors.shadow + ';'
    ]),
    level_pill_style: joinStyles([
      'background:' + background + ';',
      'border:1px solid ' + colors.border + ';',
      'color:' + colors.text + ';',
      'box-shadow:0 6rpx 18rpx ' + colors.shadow + ';'
    ]),
    level_card_style: joinStyles([
      'background:' + background + ';',
      'border:1px solid ' + colors.border + ';',
      'box-shadow:0 18rpx 40rpx ' + colors.shadow + ';'
    ]),
    level_title_style: 'color:' + colors.text + ';',
    level_desc_style: 'color:' + colors.muted + ';',
    level_hero_style: joinStyles([
      'background:' + background + ';',
      'border:1px solid ' + colors.border + ';',
      'box-shadow:0 18rpx 48rpx ' + colors.shadow + ';'
    ]),
    level_progress_style: 'background:linear-gradient(90deg, rgba(255,255,255,0.98) 0%, ' + colors.to + ' 100%);',
    level_chip_style: joinStyles([
      'background:rgba(255,255,255,0.14);',
      'border:1px solid rgba(255,255,255,0.16);',
      'color:' + colors.text + ';'
    ])
  });
}

const LEVEL_THEMES = LEVEL_THEME_DEFINITIONS.map(withThemeStyles);

function getLevelTheme(levelNo) {
  const index = clampLevelNo(levelNo) - 1;
  return Object.assign({}, LEVEL_THEMES[index]);
}

function getAllLevelThemes() {
  return LEVEL_THEMES.map(function (item) {
    return Object.assign({}, item);
  });
}

function decorateLevelUser(input) {
  const user = input && typeof input === 'object' ? input : {};
  const levelNo = clampLevelNo(user.level_no);
  const nextNo = clampLevelNo(user.level_next_no || levelNo);
  const currentTheme = getLevelTheme(levelNo);
  const nextTheme = getLevelTheme(nextNo);

  user.level_no = currentTheme.level_no;
  user.level_label = user.level_label || currentTheme.level_label;
  user.level_theme_class = currentTheme.level_theme_class;
  user.level_badge_text = currentTheme.level_badge_text;
  user.level_name = currentTheme.level_name;
  user.level_aura = currentTheme.level_aura;
  user.level_subtitle = currentTheme.level_subtitle;
  user.level_hint = currentTheme.level_hint;

  user.level_next_no = nextTheme.level_no;
  user.level_next_label = user.level_next_label || nextTheme.level_label;
  user.level_next_name = nextTheme.level_name;
  user.level_next_aura = nextTheme.level_aura;
  user.level_next_subtitle = nextTheme.level_subtitle;

  return user;
}

module.exports = {
  clampLevelNo,
  decorateLevelUser,
  getAllLevelThemes,
  getLevelTheme
};
