const mixins = require('../../../mixins/forum')
const common = require('../../../mixins/common')
const pay = require('../../../mixins/pay')
const app = getApp()
import config from "../../../utils/config";

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    header: [],
    type: 1,
    page: 1,
    posts: [],
    loadmoreShow: false,
    loading: false,
    topicload: true,
    swiperload: true,
    stickyload: true,
    sticky: [],
    showloading: false,
    isLastPage: false,
    iconTheme: "black",
    searchText: [],
    statusBarHeight: app.globalData.statusBarHeight,
    screenHeight: app.globalData.screenHeight,
    isOnShow: false,
    // 文章组件参数
    focus: false,
    isCommentPage: false,
    inputValue: '',
    imageValue: '',
    ad: config.nativeAd,
  },

  //切换导航栏
  check: function (e) {
    let that = this;
    let type = e.currentTarget.dataset.type;
    let pid = e.currentTarget.dataset.pid;
    that.setData({
      plateId: pid,
      type: type,
      posts: [],
      page: 1,
      topicload: true,
      loadmoreShow: false,
      isLastPage: false,
    })
    that.indexPosts();
  },

  //跳转搜索
  gotosearch: function () {
    wx.navigateTo({
      url: '/pages/search/search',
    })
  },

  //跳转更多顶部分类
  moretags: function () {
    this.setData({
      isOnShow: true,
    })
    wx.navigateTo({
      url: '/pages/tags/list',
    })
  },

  //跳转标签
  more: function () {
    wx.navigateTo({
      url: '/pages/article/article',
    })
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    this.getTabBar().setData({
      selected: 0
    })
    if (!that.data.isOnShow) {
      that.setData({
        header: [{
          type: 0,
          plate_name: "关注"
        }, {
          type: 1,
          plate_name: "推荐"
        }, {
          type: 2,
          plate_name: "热榜"
        }]
      })
      that.userPlate();
    }
    that.indexChoiceness();
    that.indexPosts();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    "function" == typeof this.getTabBar && this.getTabBar() && this.getTabBar().setData({
      selected: 0
    })
    let that = this;
    that.getSysMessageCount().then(function (res) {
      that.getTabBar().setData({
        sysMessageCount: res
      })
    })
    if (that.data.isOnShow) {
      that.setData({
        header: [{
          type: 0,
          plate_name: "关注"
        }, {
          type: 1,
          plate_name: "推荐"
        }, {
          type: 2,
          plate_name: "热榜"
        }],
        isOnShow: false
      })
      that.userPlate();
    }
    that.searchCarouselList();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.setData({
      page: 1,
      posts: [],
      topicload: true,
      loadmoreShow: false,
      isLastPage: false,
    })
    if (that.data.type == 2) {
      that.setData({
        stickyload: true,
      })
      that.indexChoiceness();
    }
    that.indexPosts();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    let that = this;
    that.setData({
      loadmoreShow: true,
      isLastPage: false,
      page: that.data.page + 1
    })
    that.indexPosts();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function (res) {
    if (res.from == "button") {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/sticky/sticky?id=' + this.data.postsId,
        imageUrl: '',
      }
    } else {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/tabbar/index/index',
        imageUrl: '',
      }
    }
  },
  onShareTimeline: function (res) {
    return {
      title: app.globalData.shareTitle,
      query: '',
      imageUrl: ""
    }
  },
  //跳转PC端
  toShuiXing() {
    let link = 'https://qinghang.supengjun.com';
    wx.navigateTo({
      url: '/pages/web-view/index?url=' + link,
    })
  },
  //刷新方法
  refreshEvent() {
    this.onPullDownRefresh();
  },
}

pay(options)
mixins(options)
common(options)
Page(options)