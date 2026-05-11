const mixins = require('../../../mixins/user')
const levelUtils = require('../../../utils/level')

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Number(seconds || 0));
  if (totalSeconds >= 3600) {
    return Math.floor(totalSeconds / 3600) + ' 小时';
  }
  if (totalSeconds >= 60) {
    return Math.floor(totalSeconds / 60) + ' 分钟';
  }
  return totalSeconds + ' 秒';
}

function formatPercent(value) {
  return Math.round(Math.max(0, Math.min(100, Number(value || 0)))) + '%';
}

function buildLevelGallery(levelNo) {
  return levelUtils.getAllLevelThemes().map(function (theme) {
    const isCurrent = theme.level_no === levelNo;
    const isUnlocked = levelNo >= theme.level_no;
    return {
      levelNo: theme.level_no,
      levelLabel: theme.level_label,
      levelName: theme.level_name,
      levelAura: theme.level_aura,
      levelSubtitle: theme.level_subtitle,
      badgeStyle: theme.level_badge_style,
      cardStyle: theme.level_card_style,
      titleStyle: theme.level_title_style,
      descStyle: theme.level_desc_style,
      statusText: isCurrent ? '当前等级' : (isUnlocked ? '已达成' : '未解锁'),
      statusTone: isCurrent ? 'current' : (isUnlocked ? 'done' : 'locked')
    };
  });
}

function buildLevelState(userInfo) {
  const profile = userInfo && typeof userInfo === 'object' ? userInfo : {};
  const levelNo = levelUtils.clampLevelNo(profile.level_no || 1);
  const currentTheme = levelUtils.getLevelTheme(levelNo);
  const nextNo = Math.max(levelNo, levelUtils.clampLevelNo(profile.level_next_no || levelNo));
  const nextTheme = levelUtils.getLevelTheme(nextNo);
  const levelLabel = profile.level_label || currentTheme.level_label;
  const nextLabel = profile.level_next_label || nextTheme.level_label;
  const progressPercent = Math.max(0, Math.min(100, Number(profile.level_progress_percent || 0)));
  const scoreToNext = Math.max(0, Number(profile.level_score_to_next || 0));
  const isMaxLevel = Number(profile.level_max_reached || 0) === 1 || levelNo >= 10;
  const isMember = Number(profile.is_member || profile.membership_active || 0) === 1;
  const membershipTier = isMember ? String(profile.membership_tier || 'pro').toUpperCase() : '未开通';
  const membershipExtra = Number(profile.membership_days_left || 0) > 0
    ? (' · 剩余 ' + Number(profile.membership_days_left || 0) + ' 天')
    : '';
  const membershipLabel = membershipTier + membershipExtra;

  return {
    userInfo: profile,
    hero: {
      levelLabel: levelLabel,
      levelName: currentTheme.level_name,
      levelAura: currentTheme.level_aura,
      levelTagline: currentTheme.level_subtitle,
      levelGuide: currentTheme.level_hint,
      score: Number(profile.level_score || 0),
      progressPercent: progressPercent,
      progressFillStyle: currentTheme.level_progress_style + 'width:' + progressPercent + '%;',
      summary: currentTheme.level_name + ' · ' + currentTheme.level_aura,
      progressText: isMaxLevel ? '当前已达到最高等级' : ('下一等级 ' + nextLabel + ' · ' + nextTheme.level_name),
      membershipText: membershipLabel,
      nextLabel: nextLabel,
      nextName: nextTheme.level_name,
      scoreToNextText: isMaxLevel ? '当前已满级' : ('还差 ' + scoreToNext + ' 成长值'),
      progressPercentText: formatPercent(progressPercent),
      membershipTone: isMember ? 'member' : 'base',
      heroCardStyle: currentTheme.level_hero_style,
      badgeStyle: currentTheme.level_badge_style,
      chipStyle: currentTheme.level_chip_style
    },
    overviewCards: [{
      label: '当前等级',
      value: levelLabel,
      note: currentTheme.level_name + ' · ' + currentTheme.level_aura
    }, {
      label: '当前称号',
      value: currentTheme.level_name,
      note: isMaxLevel ? '已进入顶级荣誉区间' : '门槛逐级抬升'
    }, {
      label: '下一等级',
      value: isMaxLevel ? '已满级' : nextLabel,
      note: isMaxLevel ? '无需继续升级' : ('还差 ' + scoreToNext + ' 成长值')
    }],
    levelGallery: buildLevelGallery(levelNo),
    metricCards: [{
      label: '在线时长',
      value: formatDuration(profile.online_seconds),
      note: '持续在线会稳步累计基础成长'
    }, {
      label: '活跃时长',
      value: formatDuration(profile.active_seconds),
      note: '浏览、停留和使用都会计入活跃成长'
    }, {
      label: '评论贡献',
      value: String(Number(profile.comment_growth_count || 0)),
      note: '高质量互动会让成长值更真实'
    }, {
      label: '点赞贡献',
      value: String(Number(profile.like_growth_count || 0)),
      note: '点赞与互动行为会参与成长累计'
    }, {
      label: '会员加成',
      value: '+' + Number(profile.membership_bonus_score || 0),
      note: isMember ? '会员有效期内持续生效' : '开通会员后即可获得'
    }, {
      label: '当前会员',
      value: membershipTier,
      note: isMember ? membershipExtra.replace(/^ · /, '') || '权益生效中' : '未开通会员'
    }],
    tips: [{
      title: '等级难度会逐级抬升',
      desc: 'LV1 到 LV10 不是线性难度，等级越高，升级所需的成长值会明显增加，高阶等级会更稀缺。'
    }, {
      title: '当前等级定位',
      desc: currentTheme.level_hint
    }, {
      title: isMember ? '会员加成正在生效' : '会员可以助力成长效率',
      desc: isMember
        ? ('当前为 ' + membershipLabel + '，会员有效期内会持续获得额外成长值加成。')
        : '会员有效期内会带来额外成长加成，具体倍率与奖励由后台规则统一控制。'
    }],
    membershipCta: {
      title: isMember ? '继续查看会员权益' : '开通会员提升成长效率',
      desc: isMember
        ? '会员页可以继续查看当前权益、有效期和升级方案。'
        : '会员有效期内可获得身份展示、成长加成和更多专属能力入口。',
      buttonText: isMember ? '查看会员页' : '去开通会员'
    }
  };
}

const options = {
  data: {
    userInfo: {},
    hero: {
      levelLabel: 'LV1',
      levelName: '新芽',
      levelAura: '启程身份',
      levelTagline: '成长值由在线、活跃、评论、点赞和会员加成累计',
      levelGuide: '从基础活跃开始，逐步提升到更高等级。',
      score: 0,
      progressPercent: 0,
      progressFillStyle: 'width:0%;',
      summary: '新芽 · 启程身份',
      progressText: '下一等级 LV1',
      membershipText: '未开通',
      nextLabel: 'LV1',
      nextName: '新芽',
      scoreToNextText: '还差 0 成长值',
      progressPercentText: '0%',
      membershipTone: 'base',
      heroCardStyle: '',
      badgeStyle: '',
      chipStyle: ''
    },
    overviewCards: [],
    levelGallery: [],
    metricCards: [],
    tips: [],
    membershipCta: {
      title: '开通会员提升成长效率',
      desc: '会员有效期内可获得身份展示、成长加成和更多专属能力入口。',
      buttonText: '去开通会员'
    }
  },

  syncLevelState(userInfo) {
    const nextState = buildLevelState(userInfo);
    this.setData(nextState);
  },

  refreshLevelInfo() {
    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedUserInfo) {
      this.syncLevelState(cachedUserInfo);
    }
    return this.updateUserInfo().then((nextUserInfo) => {
      if (nextUserInfo) {
        this.syncLevelState(nextUserInfo);
      }
      return nextUserInfo;
    });
  },

  onLoad() {
    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedUserInfo) {
      this.syncLevelState(cachedUserInfo);
      return;
    }
    this.syncLevelState({});
  },

  onShow() {
    this.refreshLevelInfo();
  },

  goMembershipPage() {
    wx.navigateTo({
      url: '/pages/mine/members/members',
    })
  },

  onPullDownRefresh() {
    this.refreshLevelInfo().finally(() => {
      wx.hideNavigationBarLoading();
      wx.stopPullDownRefresh();
    });
  }
}

mixins(options)
Page(options)
