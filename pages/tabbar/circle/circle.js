const mixins = require('../../../mixins/circle')
const common = require('../../../mixins/common')
const app = getApp()

const options = {
  /**
   * 页面的初始数据
   */
  data: {
    topload: true,
    toplist: [],
    taga: [{
      text: "圈子",
      id: 0
    }, {
      text: "关注",
      id: 1
    }],
    currentItem: 0,
    hotload: true,
    newlist: [],
    page: 1,
    subcatsloading: true,
    subcats: [],
    uPage: 1,
    uSubcatsloading: true,
    uSubcats: [],
    iconTheme: "black",
    hot_search: [{
      search_content: '搜索你想寻找的圈子'
    }],
    isPullDownRefresh: false,
    scrollTop: 0,
    customBar: 0,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    that.circleRecommend();
    that.geToptionsList();
    that.circleCircleAndPosts(1);
  },

  //搜索圈子
  goToSearch: function () {
    wx.navigateTo({
      url: '/pages/circleClass/circleClass?focusShow=1'
    })
  },

  //查看全部圈子
  setNewCircle: function () {
    wx.navigateTo({
      url: '/pages/circleClass/circleClass?focusShow=0'
    })
  },

  //tabbar切换
  select: function (e) {
    var that = this;
    that.setData({
      currentItem: e.target.dataset.id
    })
    if (that.data.currentItem == 0 && that.data.subcats.length <= 0) {
      that.setData({
        subcatsloading: true
      })
      that.geToptionsList();
      that.circleCircleAndPosts(1);
    } else if (that.data.currentItem == 1 && that.data.uSubcats.length <= 0) {
      that.setData({
        subcatsloading: true
      })
      that.userFollowCircleList(1);
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    "function" == typeof this.getTabBar && this.getTabBar() && this.getTabBar().setData({
      selected: 1
    })
    let that = this;
    that.getSysMessageCount().then(function (res) {
      const tabBar = typeof that.getTabBar === 'function' ? that.getTabBar() : null;
      if (tabBar) {
        tabBar.setData({
          sysMessageCount: res
        })
      }
    })
    that.setData({
      customBar: Number(app.globalData.CustomBar || 0)
    })

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.setData({
      subcats: [],
      uSubcats: [],
      subcatsloading: true
    })
    that.circleRecommend();
    if (that.data.currentItem == 0) {
      that.geToptionsList();
      that.circleCircleAndPosts(1);
    } else {
      that.userFollowCircleList(1);
    }
    if (that.data.isPullDownRefresh) {
      wx.hideNavigationBarLoading();
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    let that = this;
    that.setData({
      loadmoreShow: true,
      isLastPage: false
    })
    if (that.data.currentItem == 0) {
      let page = that.data.page + 1;
      that.circleCircleAndPosts(page);
    } else {
      let uPage = that.data.uPage + 1;
      that.userFollowCircleList(uPage);
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function (res) {
    return {
      title: app.globalData.shareTitle,
      path: '/pages/tabbar/circle/circle',
      imageUrl: '',
    }
  },

  onShareTimeline: function (res) {
    return {
      title: app.globalData.shareTitle,
      query: '',
      imageUrl: ""
    }
  },

  //跳转标签
  more: function () {
    wx.navigateTo({
      url: '/pages/article/article',
    })
  },
}

mixins(options)
common(options)
Page(options)
