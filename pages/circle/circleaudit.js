const mixins = require('../../mixins/circle')
const common = require('../../mixins/common')
const app = getApp()
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    type: 2,
    page: 1,
    posts: [],
    topicload: true,
    loadmoreShow: false,
    isLastPage: false,
    isRejected: false,
    descMaxLength: 300,
    descLength: 0,
    reject_msg: "",
  },
  onInputChange: function (t) {
    var o = t.detail.value;
    this.setData({
      reject_msg: o,
      descLength: o.length
    });
  },

  passTap(e) {
    let that = this;
    that.setData({
      isPosts: e.currentTarget.dataset.isposts
    })
    that.userAuditPosts();
  },

  rejectedTap(e) {
    let that = this;
    that.setData({
      isPosts: e.currentTarget.dataset.isposts,
      showDialog: false,
      isRejected: true,
    })
  },

  yesRejected() {
    let that = this;
    if (that.data.descLength == 0) {
      wx.showToast({
        title: '请填写驳回原因！',
        icon: 'none'
      })
    } else {
      that.userAuditPosts();
    }
  },

  onRejected() {
    this.setData({
      isRejected: false,
    })
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    that.setData({
      id: options.id
    })
    that.postsByCircleId(options.id, that.data.type, that.data.page);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {},


  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.setData({
      posts: [],
      topicload: true,
      loadmoreShow: false,
    })
    that.postsByCircleId(that.data.id, that.data.type, 1);
    wx.hideNavigationBarLoading();
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
    })
    that.postsByCircleId(that.data.id, that.data.type, that.data.page + 1);
  },

}

mixins(options)
common(options)
Page(options)