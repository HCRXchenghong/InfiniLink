const mixins = require('../../mixins/circle')
const common = require('../../mixins/common')
var util = require('../../utils/util.js');
const membership = require('../../utils/membership')
const app = getApp()

const options = {
  /**
   * 页面的初始数据
   */
  data: {
    cats: [{
      id: -1,
      plate_name: "最火"
    }, {
      id: 0,
      plate_name: "最新"
    }],
    subcats: [],
    keywordSubcats: [],
    curIndex: 0,
    subcatsloading: true,
    keywordSubcatsloading: true,
    keyword: "",
    banner: [],
    swiperload: true,
    vipPopup: false,
    circleMembershipPrompt: null,
  },

  syncCircleMembershipPrompt(userInfo) {
    this.setData({
      circleMembershipPrompt: membership.buildCirclePrompt(userInfo)
    })
  },

  vipPopupTap() {
    let that = this;
    that.setData({
      vipPopup: !that.data.vipPopup
    })
  },

  //轮播图切换
  changeCurrentIdx: function (e) {
    let that = this;
    that.setData({
      currentIdx: e.detail.current
    });
  },

  // 轮播图点击事件
  navToBannerLink: function (e) {
    let type = e.currentTarget.dataset.type;
    let link = e.currentTarget.dataset.link;
    let postsid = e.currentTarget.dataset.postsid;
    let circleid = e.currentTarget.dataset.circleid;
    if (type == 0) { //链接
      wx.navigateTo({
        url: '/pages/web-view/index?url=' + link,
      })
    } else if (type == 1) { //帖子
      wx.navigateTo({
        url: '/pages/sticky/sticky?id=' + postsid,
      })
    } else if (type == 2) { //圈子
      wx.navigateTo({
        url: '/pages/circle/list?id=' + circleid,
      })
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    that.setData({
      focusShow: Number(options.focusShow),
      circleMembershipPrompt: membership.buildCirclePrompt(wx.getStorageSync('userInfo')),
    })
    that.plateList();
    that.circleByplateid(-1);
    that.getindexBannerList();
  },

  switchRightTab: function (e) {
    var id = e.target.dataset.id,
      ids = parseInt(e.target.dataset.index);
    this.setData({
      subcatsloading: true,
      curIndex: ids,
      scrollTop: 0
    });
    this.circleByplateid(id);
  },

  addNewCircle: function () {
    let that = this;
    let res = util.loginNow();
    if (res == true) {
      let userInfo = wx.getStorageSync('userInfo') || {}
      let prompt = membership.buildCirclePrompt(userInfo)
      that.setData({
        circleMembershipPrompt: prompt
      })
      if (userInfo.is_member == 1) {
        wx.navigateTo({
          url: '/pages/circle/creat?type=0',
        })
      } else {
        wx.showModal({
          title: prompt.gateTitle,
          content: prompt.gateContent,
          cancelText: "付费开通",
          cancelColor: "#333333",
          confirmText: "活动领取",
          confirmColor: "#949494",
          success(res) {
            if (res.confirm) {
              that.setData({
                vipPopup: !that.data.vipPopup
              })
            } else if (res.cancel) {
              wx.navigateTo({
                url: '/pages/mine/members/members',
              })
            }
          }
        })
      }
    }
  },

  onSearchConfirm(e) {
    let that = this;
    that.setData({
      keyword: e.detail.value
    })
    that.circleSearch(e.detail.value);
  },

  onSearchInput(e) {
    let that = this;
    that.setData({
      keyword: e.detail.value
    })
    that.circleSearch(e.detail.value);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    let that = this;
    that.setData({
      tomorrowTime: Date.now() + 24 * 60 * 60 * 1000,
      circleMembershipPrompt: membership.buildCirclePrompt(wx.getStorageSync('userInfo'))
    })
  },

  onCircleMembershipPromptTap(e) {
    const action = e.currentTarget.dataset.action;
    const scene = e.currentTarget.dataset.scene;
    const route = membership.resolveMembershipActionRoute(action, scene);
    if (!route) {
      return;
    }
    wx.navigateTo({
      url: route,
    })
  },

  onShareAppMessage: function (res) {
    let that = this;
    if (res.from == "button") {
      setTimeout(function () {
        that.freeGetVip();
      }, 2500)
      return {
        title: '邀你一起免费领取InfiniLink 会员啦！',
        path: '/pages/tabbar/index/index',
        imageUrl: '/backend/static/illustrations/plain-credit-card-cuate.png',
      }
    } else {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/tabbar/index/index',
        imageUrl: '',
      }
    }
  },
}

common(options)
mixins(options)
Page(options)
