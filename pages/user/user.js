const mixins = require('../../mixins/user')
const common = require('../../mixins/common')
const pay = require('../../mixins/pay')
var app = getApp();
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    navbarTrans: 0,
    color: "0,0,0",
    iconTheme: "white",
    userId: 0,
    userInfo: {},
    total: 0,
    page: 1,
    posts: [],
    topicload: true,
    loadmoreShow: false,
    isLastPage: false,
    imageShow: false,
    configData: {},
    // 文章组件参数
    focus: false,
    isCommentPage: false,
    inputValue: '',
    imageValue: '',
  },

  onPageScroll: function onPageScroll(e) {
    let that = this;
    var trans = (e.scrollTop > 55 ? 55 : e.scrollTop) / 55;
    var frontColor = "#ffffff";
    var backgroundColor = "#000000";
    var iconTheme = "white";
    if (trans == 0) {
      frontColor = "#ffffff";
      backgroundColor = "#000000";
      iconTheme = "white";
    } else if (trans >= 0.4) {
      frontColor = "#000000";
      backgroundColor = "#ffffff";
      iconTheme = "black";
    }
    that.setData({
      navbarTrans: trans,
      iconTheme: iconTheme
    });
    wx.setNavigationBarColor({
      frontColor: frontColor,
      backgroundColor: frontColor,
      animation: {
        duration: 400,
        timingFunc: 'easeIn'
      }
    })
  },

  popupShowTap(e) {
    this.setData({
      typeShow: e.currentTarget.dataset.type,
      imageShow: !this.data.imageShow,
    })
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.setData({
      userId: options.id
    })
    this.getUserinfoById();
    this.userPostsById();
    this.configData();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    this.setData({
      total: 0,
      page: 1,
      posts: [],
      isNul: false,
      topicload: true,
      loadmoreShow: false,
      isLastPage: false,
    })
    this.getUserinfoById();
    this.userPostsById();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    this.setData({
      total: 0,
      page: this.data.page + 1,
      loadmoreShow: true,
      isLastPage: false,
    })
    this.userPostsById();
  },

}

pay(options)
mixins(options)
common(options)
Page(options)