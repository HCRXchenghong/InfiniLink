const app = getApp();
const api = require('../config/api');
const util = require('../utils/util');
const levelUtils = require('../utils/level');

function buildLoginUserInfo(profile) {
  if (profile && typeof profile === 'object') {
    return {
      nickName: profile.nickName || profile.user_name || 'InfiniLink 用户',
      avatarUrl: profile.avatarUrl || profile.user_avatar || '',
      province: profile.province || '',
      city: profile.city || '',
      country: profile.country || '',
      gender: profile.gender || 0,
    };
  }
  return {
    nickName: 'InfiniLink 用户',
    avatarUrl: '',
    province: '',
    city: '',
    country: '',
    gender: 0,
  };
}

function logUserError(scope, err) {
  try {
    console.error('[InfiniLink user:' + scope + ']', err);
  } catch (error) {}
}

function normalizeText(value, fallback = '') {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeMembershipTier(value) {
  const tier = normalizeText(value).toLowerCase();
  if (tier === 'pro' || tier === 'max') {
    return tier;
  }
  return '';
}

function membershipTierRank(value) {
  const tier = normalizeMembershipTier(value);
  if (tier === 'pro') {
    return 1;
  }
  if (tier === 'max') {
    return 2;
  }
  return 0;
}

function resolveMembershipGrowthMeta(code) {
  const tier = normalizeMembershipTier(code);
  if (tier === 'max') {
    return {
      growth_bonus_score: 9000,
      growth_multiplier_percent: 135,
      temporary_only: true
    };
  }
  if (tier === 'pro') {
    return {
      growth_bonus_score: 3000,
      growth_multiplier_percent: 115,
      temporary_only: true
    };
  }
  return {
    growth_bonus_score: 0,
    growth_multiplier_percent: 100,
    temporary_only: true
  };
}

function formatGrowthMultiplierText(percent) {
  const numeric = Number(percent || 100);
  if (!numeric || numeric <= 0) {
    return '1.00x';
  }
  return (numeric / 100).toFixed(numeric % 100 === 0 ? 0 : 2) + 'x';
}

function defaultMembershipPlans() {
  return [{
    code: 'pro',
    name: 'Pro',
    badge_text: 'PRO',
    tagline: '适合希望获得会员身份、建圈能力与基础创作支持的用户。',
    description: '标准会员方案，覆盖社区身份展示、会员功能入口和内容创作常用能力。',
    button_text: '开通 Pro',
    price: 99,
    duration_days: 30,
    benefits: [
      '会员身份标识与个人主页展示',
      '建圈权限与基础圈主管理能力',
      '会员有效期内享受成长值加速与额外成长奖励',
      '会员活动入口与专属公告触达'
    ],
    growth_bonus_score: 3000,
    growth_multiplier_percent: 115,
    temporary_only: true,
    enabled: true,
    sort_order: 10
  }, {
    code: 'max',
    name: 'Max',
    badge_text: 'MAX',
    tagline: '适合重度运营、品牌主理人和高频创作者的进阶会员方案。',
    description: '进阶会员方案，包含 Pro 全部能力，并提供更高等级身份和更强运营支持。',
    button_text: '升级 Max',
    price: 299,
    duration_days: 30,
    benefits: [
      '包含 Pro 全部会员权益',
      '更高等级身份标识与资料页展示',
      '会员有效期内享受更高成长值加速与额外成长奖励',
      '活动提报、专题合作与客服支持优先级更高',
      '后续上线的高级会员能力优先开放'
    ],
    growth_bonus_score: 9000,
    growth_multiplier_percent: 135,
    temporary_only: true,
    enabled: true,
    sort_order: 20
  }];
}

function normalizeMembershipPlan(value, fallback) {
  const plan = Object.assign({}, fallback || {});
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.assign(plan, value);
  }
  plan.code = normalizeMembershipTier(plan.code || fallback.code);
  plan.name = normalizeText(plan.name, fallback.name || '');
  plan.badge_text = normalizeText(plan.badge_text, fallback.badge_text || plan.name);
  plan.tagline = normalizeText(plan.tagline, fallback.tagline || '');
  plan.description = normalizeText(plan.description, fallback.description || '');
  plan.button_text = normalizeText(plan.button_text, fallback.button_text || '立即开通');
  plan.price = Number(plan.price || fallback.price || 0);
  plan.duration_days = Number(plan.duration_days || fallback.duration_days || 30);
  plan.benefits = normalizeArray(plan.benefits).map(function (item) {
    return normalizeText(item, '');
  }).filter(Boolean);
  const growthMeta = resolveMembershipGrowthMeta(plan.code || fallback.code);
  plan.growth_bonus_score = Number(plan.growth_bonus_score || growthMeta.growth_bonus_score || 0);
  plan.growth_multiplier_percent = Number(plan.growth_multiplier_percent || growthMeta.growth_multiplier_percent || 100);
  plan.growth_multiplier_text = normalizeText(plan.growth_multiplier_text, formatGrowthMultiplierText(plan.growth_multiplier_percent));
  plan.temporary_only = plan.temporary_only !== false;
  plan.enabled = plan.enabled !== false;
  plan.sort_order = Number(plan.sort_order || fallback.sort_order || 0);
  return plan;
}

function resolveMembershipActionState(currentTier, selectedPlan) {
  const nextTier = normalizeMembershipTier(selectedPlan && selectedPlan.code);
  const currentRank = membershipTierRank(currentTier);
  const nextRank = membershipTierRank(nextTier);

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
    membershipActionText: normalizeText(selectedPlan && selectedPlan.button_text, '立即开通'),
    membershipActionDisabled: false
  };
}

function resolveMembershipPlansPayload(payload) {
  const defaults = defaultMembershipPlans();
  const planMap = {};
  defaults.forEach(function (item) {
    planMap[item.code] = normalizeMembershipPlan(item, item);
  });

  normalizeArray(payload && payload.plans).forEach(function (item) {
    const code = normalizeMembershipTier(item && item.code);
    if (!code || !planMap[code]) {
      return;
    }
    planMap[code] = normalizeMembershipPlan(item, planMap[code]);
  });

  const plans = Object.keys(planMap).map(function (code) {
    return planMap[code];
  }).sort(function (a, b) {
    return a.sort_order - b.sort_order;
  });

  const currentTier = normalizeMembershipTier(payload && payload.current_tier);
  let selectedPlanCode = currentTier || 'pro';
  if (!plans.some(function (item) {
    return item.code === selectedPlanCode;
  })) {
    selectedPlanCode = plans.length > 0 ? plans[0].code : 'pro';
  }

  let selectedPlan = plans.find(function (item) {
    return item.code === selectedPlanCode;
  }) || plans[0] || normalizeMembershipPlan(defaults[0], defaults[0]);

  const actionState = resolveMembershipActionState(currentTier, selectedPlan);

  return {
    membershipPlans: plans,
    currentMembershipTier: currentTier,
    currentMembershipExpireText: normalizeText(payload && payload.current_membership && payload.current_membership.membership_expire_text),
    currentMembershipDaysLeft: Number(payload && payload.current_membership && payload.current_membership.membership_days_left || 0),
    selectedMembershipPlan: selectedPlanCode,
    selectedMembershipPlanData: selectedPlan,
    order_price: selectedPlan.price,
    membershipActionText: actionState.membershipActionText,
    membershipActionDisabled: actionState.membershipActionDisabled
  };
}

function normalizeProfileUser(value) {
  const user = value && typeof value === 'object' && !Array.isArray(value) ? Object.assign({}, value) : {};
  const expiresAt = normalizeText(user.membership_expires_at);
  let isMember = Number(user.is_member || user.membership_active || 0) === 1;
  user.membership_expires_at = expiresAt;
  user.membership_expire_text = normalizeText(user.membership_expire_text);
  user.membership_days_left = Number(user.membership_days_left || 0);
  user.membership_tier = normalizeMembershipTier(user.membership_tier);
  if (isMember && expiresAt) {
    const expireTs = Date.parse(expiresAt);
    if (!Number.isNaN(expireTs) && expireTs <= Date.now()) {
      isMember = false;
    }
  }
  user.is_member = isMember ? 1 : 0;
  user.membership_active = user.is_member;
  if (user.is_member === 1 && !user.membership_tier) {
    user.membership_tier = 'pro';
  }
  if (user.is_member !== 1) {
    user.membership_tier = '';
  }
  user.level_no = Math.max(1, Number(user.level_no || 1));
  user.level_label = normalizeText(user.level_label, 'LV' + user.level_no);
  user.level_score = Number(user.level_score || 0);
  user.level_current_min_score = Number(user.level_current_min_score || 0);
  user.level_next_no = Math.max(user.level_no, Number(user.level_next_no || user.level_no));
  user.level_next_label = normalizeText(user.level_next_label, 'LV' + user.level_next_no);
  user.level_next_min_score = Number(user.level_next_min_score || user.level_score || 0);
  user.level_score_to_next = Math.max(0, Number(user.level_score_to_next || 0));
  user.level_progress_percent = Math.max(0, Math.min(100, Number(user.level_progress_percent || 0)));
  user.level_max_reached = Number(user.level_max_reached || 0);
  user.online_seconds = Number(user.online_seconds || 0);
  user.active_seconds = Number(user.active_seconds || 0);
  user.comment_growth_count = Number(user.comment_growth_count || 0);
  user.like_growth_count = Number(user.like_growth_count || 0);
  user.membership_bonus_score = Number(user.membership_bonus_score || 0);
  return levelUtils.decorateLevelUser(user);
}

// 获取用户信息
const loginByWeixin = function () {
  let userInfo = buildLoginUserInfo(wx.getStorageSync('userInfo'));
  let code = null;
  return new Promise(function (resolve, reject) {
    return util.login().then((res) => {
      code = res.code;
      return util.getUserProfile();
    }).then((res) => {
      userInfo = buildLoginUserInfo(res.userInfo);
    }).catch(() => {
      // In DevTools and some newer permission flows, profile APIs can fail.
      // We still allow backend login with wx.login code plus a cached/default profile.
      return null;
    }).then(() => {
      util.request(api.loginUrl, {
        userInfo: userInfo,
        code: code
      }, 'POST').then(res => {
        if (res.code === 200) {
          wx.removeStorageSync('banInfo');
          //存储用户token
          wx.setStorageSync('token', res.data.token);
          //存储用户信息
          util.request(api.userInfoUrl).then(function (res) {
            const normalizedUser = normalizeProfileUser(res.data);
            wx.setStorageSync('userInfo', normalizedUser)
            resolve(normalizedUser);
          }).catch(function (err) {
            logUserError('loginByWeixin:userInfo', err);
            const fallbackUser = normalizeProfileUser(buildLoginUserInfo(userInfo));
            wx.setStorageSync('userInfo', fallbackUser);
            resolve(fallbackUser);
          })
        } else {
          reject(res);
        }
      }).catch((err) => {
        logUserError('loginByWeixin:login', err);
        reject(err);
      });
    }).catch((err) => {
      logUserError('loginByWeixin', err);
      reject(err);
    })
  })
}

//更新用户信息
const updateUserInfo = function () {
  return util.request(api.userInfoUrl).then(function (res) {
    const normalizedUser = normalizeProfileUser(res.data);
    wx.setStorageSync('userInfo', normalizedUser)
    return normalizedUser;
  }).catch(function (err) {
    logUserError('updateUserInfo', err);
    return null;
  })
}

// 修改用户信息
const updateInfo = function (data) {
  let that = this;
  let datas = {
    user_avatar: that.data.avatar,
    user_name: that.data.nickName,
    user_introduce: that.data.signature,
    user_birthday: that.data.birth,
    user_background_maps: that.data.imagesubject,
  }
  util.request(api.updateInfoUrl, datas, "POST").then(function (res) {
    if (res.status) {
      wx.hideLoading();
      wx.showToast({
        title: '保存成功！审核中...',
        icon: 'none'
      })
      return updateUserInfo();
    }
  })
}

//我的帖子/收藏/喜欢
const userPosts = function (currentItem, page) {
  let that = this;
  util.request(api.userPostsUrl, {
    type: currentItem,
    page: page,
  }).then(res => {
    if (res.status) {
      let data = res.data;
      let args = {};
      if (data.data.length <= 0 && page == 1) {
        args.isNul = true;
      }
      if (data.data.length == 0) {
        args.isLastPage = true;
      } else if (currentItem == 0) {
        args.myPostsList = that.data.myPostsList.concat(data.data);
        args.myPostsPage = data.current_page;
      } else if (currentItem == 1) {
        args.myLikePostsList = that.data.myLikePostsList.concat(data.data);
        args.myLikePostsPage = data.current_page;
      } else if (currentItem == 2) {
        args.myCollectionList = that.data.myCollectionList.concat(data.data);
        args.myCollectionPage = data.current_page;
      } else if (currentItem == 3) {
        args.myExceptionalList = that.data.myExceptionalList.concat(data.data);
        args.myExceptionalPage = data.current_page;
      }
      args.posts = that.data.posts.concat(data.data);
      if (that.data.topicload) {
        args.isPullDownRefresh = true;
      }
      args.topicload = false;
      that.setData(args);
    }
  }).catch((err) => {
    logUserError('userPosts', err);
    that.setData({
      topicload: false,
      loadmoreShow: false,
      isPullDownRefresh: true
    });
  })
}

/**
 * 用户反馈
 */
const userFeedback = function () {
  let that = this;
  let feedback_content = that.data.feedback_content;
  if (feedback_content == '' || feedback_content == null) {
    wx.showToast({
      title: '您还没有填写您的问题和意见哦！',
      icon: 'none'
    })
    return;
  }
  wx.showLoading({
    title: '提交中',
    mask: true
  })
  util.request(api.userFeedbackUrl, {
    feedback_type: Number(that.data.feedback_type || 0),
    feedback_content: feedback_content,
  }, "POST").then(function (res) {
    wx.hideLoading();
    if (res && (res.status || res.code === 200)) {
      wx.showToast({
        title: '反馈成功！',
        icon: 'none'
      })
      return;
    }
    wx.showToast({
      title: normalizeText(res && res.message, '提交失败，请稍后重试'),
      icon: 'none'
    })
  }).catch(function (err) {
    logUserError('userFeedback', err);
    wx.hideLoading();
    wx.showToast({
      title: '提交失败，请稍后重试',
      icon: 'none'
    })
  })
}

/**
 * 用户认证状态
 */
const userAuthentication = function () {
  let that = this;
  util.request(api.userAuthenticationUrl).then(function (res) {
    let args = {};
    if (res.data == null || res.data == '') {
      args.isA = false;
    } else {
      args.isA = true;
    }
    args.alist = res.data;
    args.swiperload = false;
    that.setData(args);
  })
}

/**
 * 用户认证
 */
const addAuthentication = function () {
  let that = this;
  let name = that.data.name;
  let phone = that.data.phone;
  let desc = that.data.desc;
  let imagesubject = that.data.imagesubject;
  if (name == '' || name == null) {
    wx.showToast({
      title: '请填写名称',
      icon: 'none'
    })
    return;
  }
  if (phone == '' || phone == null) {
    wx.showToast({
      title: '请填写联系方式',
      icon: 'none'
    })
    return;
  }
  if (desc == '' || desc == null) {
    wx.showToast({
      title: '请填写介绍',
      icon: 'none'
    })
    return;
  }
  if (imagesubject == null) {
    wx.showToast({
      title: '请上传身份信息证明图片',
      icon: 'none'
    })
    return;
  }
  util.request(api.userAuthenticationUrl, {
    name: name,
    contact_information: phone,
    introduce: desc,
    identity_picture: imagesubject,
  }, "POST").then(function (res) {
    wx.hideLoading();
    wx.showToast({
      title: '提交成功！',
      icon: 'none'
    })
    return userAuthentication();
  })
}

//用户创建的圈子列表
const userCricle = function () {
  let that = this;
  util.request(api.userCricleUrl).then(function (res) {
    let args = {};
    args.subcats = res.data;
    args.subcatsloading = false;
    that.setData(args)
  }).catch(function (err) {
    logUserError('userCricle', err);
    that.setData({
      subcats: [],
      subcatsloading: false
    })
  })
}

//用户相关帖子count
const userTotalPost = function () {
  let that = this;
  util.request(api.userTotalPostUrl).then(function (res) {
    let args = {};
    let data = that.data.taga;
    data[0].ums = res.data.myTotal;
    data[1].ums = res.data.collecTotal;
    data[2].ums = res.data.likeTotal;
    data[3].ums = res.data.exceptionalTotal;
    args.taga = data;
    that.setData(args)
  }).catch(function (err) {
    logUserError('userTotalPost', err);
  })
}

//关注列表
const followUserList = function () {
  let that = this;
  let apiUsl = api.followUserUrl;
  if (that.data.type == 1) {
    apiUsl = api.fansUserUrl;
  }
  util.request(apiUsl, {
    user_id: that.data.userid,
    page: that.data.page,
  }).then(function (res) {
    let data = res.data;
    let args = {};
    if (data.data.length <= 0) {
      args.isLastPage = true;
    }
    args.userList = that.data.userList.concat(data.data);
    args.loadmore = false;
    args.page = data.current_page;
    that.setData(args)
  }).catch(function (err) {
    logUserError('followUserList', err);
    that.setData({
      loadmore: false
    })
  })
}

//通过用户id获取用户公开信息
const getUserinfoById = function () {
  let that = this;
  util.request(api.getUserinfoByIdUrl, {
    user_id: that.data.userId
  }).then(function (res) {
    let args = {};
    args.userInfo = normalizeProfileUser(res.data);
    that.setData(args)
  }).catch(function (err) {
    logUserError('getUserinfoById', err);
  })
}

//通过用户id获取用户动态
const userPostsById = function () {
  let that = this;
  util.request(api.userPostsByIdUrl, {
    page: that.data.page,
    user_id: that.data.userId
  }).then(function (res) {
    let data = res.data;
    let args = {};
    if (data.data.length < 6) {
      args.isLastPage = true;
    }
    args.posts = that.data.posts.concat(data.data);
    args.topicload = false;
    args.page = data.current_page;
    args.total = data.total;
    that.setData(args);
  }).catch(function (err) {
    logUserError('userPostsById', err);
    that.setData({
      topicload: false,
      loadmoreShow: false
    });
  })
}

//获取会员价格
const getMembersPrice = function () {
  let that = this;
  return util.request(api.getMembersPriceUrl).then(function (res) {
    if (res.status) {
      const nextState = resolveMembershipPlansPayload(res.data);
      that.setData(nextState)
      return nextState;
    } else {
      const nextState = resolveMembershipPlansPayload(null);
      that.setData(nextState)
      return nextState;
    }
  }).catch(function (err) {
    logUserError('getMembersPrice', err);
    const nextState = resolveMembershipPlansPayload(null);
    that.setData(nextState)
    return nextState;
  })
}

//获取配置数据
const configData = function () {
  let that = this;
  util.request(api.configDatalUrl).then(function (res) {
    if (res.status) {
      let args = {};
      args.configData = res.data;
      that.setData(args)
    }
  }).catch(function (err) {
    logUserError('configData', err);
    that.setData({
      configData: {}
    })
  })
}

//用户订单
const myOrder = function () {
  let that = this;
  util.request(api.myOrderUrl, {
    page: that.data.page
  }).then(function (res) {
    if (res.status) {
      let data = res.data;
      let args = {};
      if (data.data.length < 10) {
        args.isLastPage = true;
      }
      args.loading = false;
      args.orderList = that.data.orderList.concat(data.data);
      args.page = data.current_page;
      that.setData(args)
    }
  }).catch(function (err) {
    logUserError('myOrder', err);
    that.setData({
      loading: false
    })
  })
}


//用户收益
const myFinancial = function () {
  let that = this;
  util.request(api.myFinancialUrl).then(function (res) {
    if (res.status) {
      let data = res.data;
      let args = {};
      let withdrawal = that.data.withdrawal;
      args.sumPrice = data.sum_price;
      args.bankName = data.bank_name;
      args.bankId = data.bank_card;
      withdrawal[0].i = data.earnings_yesterday;
      withdrawal[1].i = data.balance;
      withdrawal[2].i = data.withdrawal_price;
      args.withdrawal = withdrawal;
      args.withdrawalBalance = data.balance;
      that.setData(args)
    }
    that.animate();
  }).catch(function (err) {
    logUserError('myFinancial', err);
  })
}

//用户提现列表
const myUserWithdrawal = function () {
  let that = this;
  util.request(api.myUserWithdrawalUrl).then(function (res) {
    if (res.status) {
      let args = {};
      if (res.data.length <= 0) {
        args.isWithdrawal = false;
      }
      args.withdrawalList = res.data;
      that.setData(args)
    }
  }).catch(function (err) {
    logUserError('myUserWithdrawal', err);
  })
}

//用户收益列表
const myUserExceptional = function () {
  let that = this;
  util.request(api.myUserExceptionalUrl).then(function (res) {
    if (res.status) {
      let args = {};
      if (res.data.length <= 0) {
        args.isExceptional = false;
      }
      args.exceptionalList = res.data;
      that.setData(args)
    }
  }).catch(function (err) {
    logUserError('myUserExceptional', err);
  })
}

//用户提现
const withdrawalPay = function () {
  let that = this;
  let price = that.data.price;
  let bankName = that.data.bankName;
  let bankId = that.data.bankId;
  if (price == '' || price == null) {
    wx.showToast({
      title: '请选择提现金额！',
      icon: 'none'
    })
    return;
  }
  if (bankName == '' || bankName == null) {
    wx.showToast({
      title: '请输入支行名称！',
      icon: 'none'
    })
    return;
  }
  if (bankId == '' || bankId == null) {
    wx.showToast({
      title: '请输入银行卡号！',
      icon: 'none'
    })
    return;
  }
  util.request(api.initiateWithdrawalUrl, {
    price: price,
    bank_name: bankName,
    bank_card: bankId,
  }, 'POST').then(function (res) {
    if (res.status) {
      wx.showModal({
        title: '发起提现成功',
        content: 'InfiniLink 会在 1 至 3 个工作日内为您处理，请您耐心等待！',
        showCancel: false,
        confirmText: "朕知道了",
        confirmColor: "#333333",
        success(res) {
          that.setData({
            withdrawalPopup: !that.data.withdrawalPopup
          })
          that.myFinancial();
          that.myUserWithdrawal();
        }
      })
    }
  })
}

//PC登录信息
const pcLogin = function () {
  let that = this;
  util.getNewToken().then(() => {
    util.request(api.pcLoginUrl, {
      token: wx.getStorageSync('token'),
      scene: that.data.scene,
    }).then(function (res) {
      that.setData({
        btnState: false
      })
      wx.reLaunch({
        url: '/pages/tabbar/index/index',
      })
    })
  })
}

module.exports = function (obj) {

  obj.pcLogin = pcLogin;
  obj.myUserExceptional = myUserExceptional;
  obj.myUserWithdrawal = myUserWithdrawal;
  obj.myFinancial = myFinancial;
  obj.myOrder = myOrder;
  obj.withdrawalPay = withdrawalPay;
  obj.loginByWeixin = loginByWeixin;
  obj.updateInfo = updateInfo;
  obj.userPosts = userPosts;
  obj.userTotalPost = userTotalPost;
  obj.updateUserInfo = updateUserInfo;
  obj.userFeedback = userFeedback;
  obj.addAuthentication = addAuthentication;
  obj.userAuthentication = userAuthentication;
  obj.userCricle = userCricle;
  obj.followUserList = followUserList;
  obj.getUserinfoById = getUserinfoById;
  obj.userPostsById = userPostsById;
  obj.getMembersPrice = getMembersPrice;
  obj.configData = configData;
}
