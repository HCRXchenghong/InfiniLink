const app = getApp();
const api = require('../config/api');
const util = require('../utils/util');

function logCircleError(scope, err) {
  try {
    console.error('[InfiniLink circle:' + scope + ']', err);
  } catch (error) {}
}

/**
 * 获取板块列表建圈用
 */
const geToptionsList = function () {
  let that = this;
  util.request(api.optionsListUrl).then(function (res) {
    let args = {}
    args.cats = res.data;
    args.hotload = false;
    that.setData(args)
  }).catch(function (err) {
    logCircleError('geToptionsList', err);
    that.setData({
      hotload: false,
      subcatsloading: false
    })
  })
}

/**
 * 创建/修改圈子
 */
const creatCircle = function () {
  let that = this;
  if (that.data.imageAvatar == null) {
    wx.showToast({
      title: '请上传圈子头像',
      icon: 'none'
    })
    return
  }
  if (that.data.imageSubject == null) {
    wx.showToast({
      title: '请上传圈子封面',
      icon: 'none'
    })
    return
  }
  if (that.data.circleName == "") {
    wx.showToast({
      title: '请输入圈子名称',
      icon: 'none'
    })
    return
  }
  if (that.data.circleDesc == "") {
    wx.showToast({
      title: '请输入圈子简介',
      icon: 'none'
    })
    return
  }
  if (!that.data.protocolChecked) {
    wx.showToast({
      title: '请阅读并同意圈主协议',
      icon: 'none'
    })
    return
  }
  wx.showLoading({
    title: '提交中...'
  });
  let datas = {
    id: that.data.id,
    circle_name: that.data.circleName,
    circle_introduce: that.data.circleDesc,
    head_portrait: that.data.imageAvatar,
    background_maps: that.data.imageSubject,
    plate_id: that.data.parent,
  }
  util.request(api.addCircleUrl, datas, "POST").then(function (res) {
    wx.hideLoading();
    if (res.data && res.data.moderated) {
      wx.showModal({
        title: '圈子已下架',
        content: '您发布的信息存在违规，已为您下架处理。' + (res.data.reason ? '\n原因：' + res.data.reason : ''),
        showCancel: false,
        confirmText: "我知道了",
        confirmColor: "#333333",
        success() {
          wx.navigateBack();
        }
      })
      return;
    }
    wx.showModal({
      title: '提交成功',
      content: 'InfiniLink 审核团队会在 24 小时内为您处理，请您耐心等待！',
      showCancel: false,
      confirmText: "朕知道了",
      confirmColor: "#333333",
      success(res) {
        wx.navigateBack();
      }
    })
  })
}

/**
 * 获取板块列表
 */
const plateList = function () {
  let that = this;
  util.request(api.plateListUrl).then(function (res) {
    let args = {}
    args.cats = that.data.cats.concat(res.data);
    that.setData(args)
  })
}

/**
 * 通过板块ID获取圈子列表
 */
const circleByplateid = function (id) {
  let that = this;
  util.request(api.circleByplateidUrl, {
    plate_id: id
  }).then(function (res) {
    let args = {}
    args.subcats = res.data;
    args.subcatsloading = false;
    that.setData(args)
  })
}

/**
 * 搜索圈子
 */
const circleSearch = function (keyword) {
  let that = this;
  util.request(api.circleSearchUrl, {
    keyword: keyword
  }).then(function (res) {
    let args = {}
    args.keywordSubcats = res.data.data;
    args.keywordSubcatsloading = false;
    that.setData(args)
  })
}

/**
 * 推荐圈子4
 */
const circleRecommend = function () {
  let that = this;
  util.request(api.circleRecommendUrl).then(function (res) {
    let args = {}
    args.toplist = res.data;
    args.topload = false;
    that.setData(args)
  }).catch(function (err) {
    logCircleError('circleRecommend', err);
    that.setData({
      toplist: [],
      topload: false
    })
  })
}

/**
 * 最新圈子
 */
const circleNot = function () {
  let that = this;
  util.request(api.circleNotUrl).then(function (res) {
    let args = {}
    args.notlist = res.data;
    args.hotload = false;
    that.setData(args)
  })
}

/**
 * 全部圈子
 */
const circleCircleAndPosts = function (page) {
  let that = this;
  util.request(api.circleCircleAndPostsUrl, {
    page: page
  }).then(function (res) {
    let data = res.data.data;
    let args = {};
    if (data.length == 0) {
      args.isLastPage = true;
    } else {
      args.subcats = that.data.subcats.concat(data);
      args.page = res.data.current_page;
      args.subcatsloading = false;
      args.loadmoreShow = false;
    }
    args.isPullDownRefresh = true;
    that.setData(args);
  }).catch(function (err) {
    logCircleError('circleCircleAndPosts', err);
    that.setData({
      subcatsloading: false,
      loadmoreShow: false,
      isPullDownRefresh: true
    })
  })
}

/**
 * 用户关注圈子
 */
const userFollowCircleList = function (page) {
  let that = this;
  util.request(api.userFollowCircleListUrl, {
    page: page
  }).then(function (res) {
    let data = res.data.data;
    let args = {};
    if (data.length == 0) {
      args.isLastPage = true;
      if (page == 1) {
        args.subcatsloading = false;
      }
    } else {
      if (data.length < 10) {
        args.isMore = true;
      }
      args.uSubcats = that.data.uSubcats.concat(data);
      args.uPage = res.data.current_page;
      args.subcatsloading = false;
      args.loadmoreShow = false;
    }
    args.isPullDownRefresh = true;
    that.setData(args);
  }).catch(function (err) {
    logCircleError('userFollowCircleList', err);
    that.setData({
      subcatsloading: false,
      loadmoreShow: false,
      isPullDownRefresh: true
    })
  })
}

//跳转圈子
const routeClubDetail = function (e) {
  let id = e.currentTarget.dataset.id;
  wx.navigateTo({
    url: '/pages/circle/list?id=' + id,
  })
}

/**
 * 圈子详情
 */
const circleInfo = function (id) {
  let that = this;
  util.request(api.circleInfoUrl, {
    circle_id: id
  }).then(function (res) {
    let args = {};
    args.circleInfo = res.data;
    that.setData(args);
  })
}

/**
 * 取消关注/关注圈子
 */
const quitCircle = function (e) {
  let that = this;
  const circleId = Number(e.currentTarget.dataset.id || 0);
  if (!circleId) {
    wx.showToast({
      title: '圈子参数不正确',
      icon: 'none',
      duration: 1500
    })
    return;
  }
  util.request(api.userFollowCircleUrl, {
    circle_id: circleId
  }, "POST").then(function (res) {
    if (res.status) {
      let circleInfo = that.data.circleInfo;
      circleInfo.is_follow_circle = !circleInfo.is_follow_circle;
      that.setData({
        circleInfo: circleInfo
      })
      if (circleInfo.is_follow_circle) {
        wx.showToast({
          title: '关注成功',
          icon: 'none',
          duration: 1500
        })
      } else {
        wx.showToast({
          title: '取消关注成功',
          icon: 'none',
          duration: 1500
        })
      }
    }
  })
}

/**
 * 圈子帖子
 */
const postsByCircleId = function (id, type, page) {
  let that = this;
  util.request(api.postsByCircleIdUrl, {
    circle_id: id,
    type: type,
    page: page,
  }).then(function (res) {
    if (res.code === 200) {
      let data = res.data;
      let args = {};
      if (data.data.length <= 0 && page == 1) {
        args.isNul = true;
      }
      if (data.data.length == 0) {
        args.isLastPage = true;
      } else if (type == 0) {
        args.postsList = that.data.postsList.concat(data.data);
        args.postsPage = data.current_page;
      } else if (type == 1) {
        args.newPostsList = that.data.newPostsList.concat(data.data);
        args.newPostsPage = data.current_page;
      }
      args.posts = that.data.posts.concat(data.data);
      if (that.data.topicload) {
        args.isPullDownRefresh = true;
      }
      args.topicload = false;
      that.setData(args);
    }
  })
}

/**
 * 审核帖子
 */
const userAuditPosts = function () {
  let that = this;
  let isPosts = that.data.isPosts;
  let postsId = that.data.postsId;
  let postsIndex = that.data.postsIndex;
  let reject_msg = that.data.reject_msg;
  util.request(api.userAuditPostsUrl, {
    id: postsId,
    type: isPosts,
    reject_msg: reject_msg
  }, "POST").then(function (res) {
    if (res.status) {
      let args = {};
      let posts = that.data.posts;
      posts.splice([postsIndex], 1);
      args.posts = posts;
      args.showDialog = false;
      args.isRejected = false;
      that.setData(args)
      wx.showToast({
        title: '操作成功！',
        icon: 'none'
      })
    }
  })
}

/**
 * 圈子详情(修改用)
 */
const editorCircleInfo = function (id) {
  let that = this;
  util.request(api.circleInfoUrl, {
    circle_id: id
  }).then(function (res) {
    let cats = that.data.cats;
    let args = {};
    args.id = res.data.id;
    args.imageAvatar = res.data.head_portrait;
    args.imageSubject = res.data.background_maps;
    args.circleName = res.data.circle_name;
    args.circleDesc = res.data.circle_introduce;
    args.nameLength = res.data.circle_name.length;
    args.descLength = res.data.circle_introduce.length;
    args.parent = res.data.plate_id;
    for (let v in cats) {
      if (cats[v].id == res.data.plate_id) {
        args.index = v;
      }
    }
    that.setData(args);
  })
}

/**
 * 获取板块列表建圈用
 */
const freeGetVip = function () {
  let that = this;
  util.request(api.freeGetVipUrl).then(function (res) {
    if (res.status) {
      util.request(api.userInfoUrl).then(function (res) {
        wx.setStorageSync('userInfo', res.data)
        that.setData({
          vipPopup: false
        })
        wx.showToast({
          title: '领取成功，已为您开通 InfiniLink 会员！',
          icon: 'none'
        })
      })
    }
  })
}

/**
 * 获取板块列表建圈用
 */
const getCircleUserList = function (cid) {
  let that = this;
  util.request(api.getCircleUserListUrl, {
    circle_id: cid
  }).then(function (res) {
    if (res.status) {
      let args = {};
      args.circleUser = res.data
      that.setData(args)
    }
  })
}


module.exports = function (obj) {
  obj.data = Object.assign({
    posterConfig: {},
    circleInfo: {},
  }, obj.data || {});

  obj.getCircleUserList = getCircleUserList;
  obj.freeGetVip = freeGetVip;
  obj.geToptionsList = geToptionsList;
  obj.creatCircle = creatCircle;
  obj.plateList = plateList;
  obj.circleByplateid = circleByplateid;
  obj.circleSearch = circleSearch;
  obj.circleRecommend = circleRecommend;
  obj.circleNot = circleNot;
  obj.circleCircleAndPosts = circleCircleAndPosts;
  obj.userFollowCircleList = userFollowCircleList;
  obj.routeClubDetail = routeClubDetail;
  obj.circleInfo = circleInfo;
  obj.quitCircle = quitCircle;
  obj.postsByCircleId = postsByCircleId;
  obj.userAuditPosts = userAuditPosts;
  obj.editorCircleInfo = editorCircleInfo;
}
