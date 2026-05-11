const mixins = require('../../../mixins/user')
const pay = require('../../../mixins/pay')

function formatPlanDuration(days) {
  return Number(days || 0) > 0 ? (Number(days || 0) + ' 天') : '按后台配置';
}

function resolveMembershipActionState(currentTier, selectedPlan) {
  const rankMap = {
    '': 0,
    pro: 1,
    max: 2
  };
  const nextTier = selectedPlan && selectedPlan.code ? String(selectedPlan.code) : '';
  const currentRank = rankMap[String(currentTier || '')] || 0;
  const nextRank = rankMap[nextTier] || 0;

  if (selectedPlan && selectedPlan.enabled === false) {
    return {
      membershipActionText: '该会员方案暂未开放',
      membershipActionDisabled: true
    };
  }

  if (currentRank > 0 && currentRank === nextRank) {
    return {
      membershipActionText: '当前已开通',
      membershipActionDisabled: true
    };
  }

  if (currentRank > nextRank && nextRank > 0) {
    return {
      membershipActionText: '已拥有更高等级会员',
      membershipActionDisabled: true
    };
  }

  if (currentTier === 'pro' && nextTier === 'max') {
    return {
      membershipActionText: '升级到 Max',
      membershipActionDisabled: false
    };
  }

  return {
    membershipActionText: selectedPlan && selectedPlan.button_text ? selectedPlan.button_text : '立即开通',
    membershipActionDisabled: false
  };
}

function buildCurrentMembershipCard(currentTier, daysLeft, expireText) {
  const tier = String(currentTier || '');
  const remainingDays = Math.max(0, Number(daysLeft || 0));
  if (tier === 'max') {
    return {
      badge: 'MAX',
      title: '当前已开通 Max 会员',
      desc: expireText ? (expireText + ' 到期') : '高阶权益已生效，到期后自动失效。',
      statusText: remainingDays > 0 ? ('剩余 ' + remainingDays + ' 天') : '权益生效中',
      tone: 'max'
    };
  }
  if (tier === 'pro') {
    return {
      badge: 'PRO',
      title: '当前已开通 Pro 会员',
      desc: expireText ? (expireText + ' 到期') : '基础会员权益已生效，到期后自动失效。',
      statusText: remainingDays > 0 ? ('剩余 ' + remainingDays + ' 天') : '权益生效中',
      tone: 'pro'
    };
  }
  return {
    badge: '未开通',
    title: '当前还没有会员',
    desc: '开通后即可获得身份展示、成长加速和专属能力入口。',
    statusText: '选择适合你的方案',
    tone: 'base'
  };
}

function buildSelectedPlanHighlights(selectedPlan) {
  if (!selectedPlan) {
    return [];
  }
  return [{
    label: '有效期',
    value: formatPlanDuration(selectedPlan.duration_days)
  }, {
    label: '成长奖励',
    value: '+' + Number(selectedPlan.growth_bonus_score || 0)
  }, {
    label: '成长倍率',
    value: selectedPlan.growth_multiplier_text || '1x'
  }];
}

function buildComparisonRows(plans) {
  const list = Array.isArray(plans) ? plans : [];
  const proPlan = list.find(function (item) {
    return item.code === 'pro';
  }) || {};
  const maxPlan = list.find(function (item) {
    return item.code === 'max';
  }) || {};
  return [{
    label: '有效期',
    proValue: formatPlanDuration(proPlan.duration_days),
    maxValue: formatPlanDuration(maxPlan.duration_days)
  }, {
    label: '成长奖励',
    proValue: '+' + Number(proPlan.growth_bonus_score || 0),
    maxValue: '+' + Number(maxPlan.growth_bonus_score || 0)
  }, {
    label: '成长倍率',
    proValue: proPlan.growth_multiplier_text || '1x',
    maxValue: maxPlan.growth_multiplier_text || '1x'
  }, {
    label: '身份展示',
    proValue: 'Pro 标识',
    maxValue: 'Max 标识'
  }, {
    label: '支持能力',
    proValue: '基础支持',
    maxValue: '优先支持'
  }];
}

function buildSelectedPlanNotes(selectedPlan, currentTier) {
  const plan = selectedPlan || {};
  const notes = [
    '所有会员均为限时权益，到期后身份标识与专属入口会自动失效。',
    '已经累计的成长值与等级结果会保留，不会因为会员到期清空。'
  ];
  if (plan.code === 'max') {
    notes.push('Max 包含 Pro 的全部基础能力，并增加更高优先级支持与更强成长加速。');
  } else if (plan.code === 'pro') {
    notes.push('Pro 更适合先开通基础身份展示、建圈权限和会员成长加速能力。');
  }
  if (currentTier && currentTier === plan.code) {
    notes.unshift('当前账号正在使用这个方案，续费或升级前可以先查看剩余有效期。');
  }
  return notes;
}

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    configData: {},
    order_price: 99,
    membershipPlans: [],
    selectedMembershipPlan: 'pro',
    selectedMembershipPlanData: null,
    currentMembershipTier: '',
    currentMembershipExpireText: '',
    currentMembershipDaysLeft: 0,
    membershipActionText: '立即开通',
    membershipActionDisabled: false,
    selectedPlanTone: 'pro',
    currentMembershipCard: {
      badge: '未开通',
      title: '当前还没有会员',
      desc: '开通后即可获得身份展示、成长加速和专属能力入口。',
      statusText: '选择适合你的方案',
      tone: 'base'
    },
    selectedPlanHighlights: [],
    comparisonRows: [],
    selectedPlanNotes: [],
  },

  refreshMembershipViewState: function () {
    const currentMembershipCard = buildCurrentMembershipCard(
      this.data.currentMembershipTier,
      this.data.currentMembershipDaysLeft,
      this.data.currentMembershipExpireText
    );
    this.setData({
      selectedPlanTone: this.data.selectedMembershipPlanData && this.data.selectedMembershipPlanData.code
        ? this.data.selectedMembershipPlanData.code
        : 'pro',
      currentMembershipCard: currentMembershipCard,
      selectedPlanHighlights: buildSelectedPlanHighlights(this.data.selectedMembershipPlanData),
      comparisonRows: buildComparisonRows(this.data.membershipPlans),
      selectedPlanNotes: buildSelectedPlanNotes(this.data.selectedMembershipPlanData, this.data.currentMembershipTier)
    });
  },

  selectMembershipPlan: function (e) {
    const code = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.code : '';
    const plans = Array.isArray(this.data.membershipPlans) ? this.data.membershipPlans : [];
    const selectedPlan = plans.find(function (item) {
      return item.code === code;
    });
    if (!selectedPlan) {
      return;
    }
    const actionState = resolveMembershipActionState(this.data.currentMembershipTier, selectedPlan);
    this.setData({
      selectedMembershipPlan: selectedPlan.code,
      selectedMembershipPlanData: selectedPlan,
      order_price: Number(selectedPlan.price || 0),
      membershipActionText: actionState.membershipActionText,
      membershipActionDisabled: actionState.membershipActionDisabled
    }, () => {
      this.refreshMembershipViewState();
    });
  },

  handleMembershipPurchase: function () {
    if (this.data.membershipActionDisabled) {
      wx.showToast({
        title: this.data.membershipActionText || '当前方案不可购买',
        icon: 'none'
      });
      return;
    }

    const currentTier = String(this.data.currentMembershipTier || '');
    const nextTier = String(this.data.selectedMembershipPlan || 'pro');
    const selectedPlanData = this.data.selectedMembershipPlanData || null;
    if (selectedPlanData && selectedPlanData.enabled === false) {
      wx.showToast({
        title: '该会员方案暂未开放',
        icon: 'none'
      });
      return;
    }
    const rankMap = {
      '': 0,
      pro: 1,
      max: 2
    };
    if (currentTier && (rankMap[currentTier] || 0) >= (rankMap[nextTier] || 0)) {
      wx.showToast({
        title: currentTier === nextTier ? '当前方案已开通' : '你已拥有更高等级会员',
        icon: 'none'
      });
      return;
    }
    this.openMembershipAccount();
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    this.configData();
    this.getMembersPrice().then(() => {
      this.refreshMembershipViewState();
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
}

pay(options)
mixins(options)
Page(options)
