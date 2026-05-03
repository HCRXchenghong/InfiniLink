const mixins = require('../../../mixins/user')
const common = require('../../../mixins/common')
var util = require('../../../utils/util.js');
var app = getApp();
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    avatar: "",
    signature: "",
    imagesubject: "",
    birth: "请选择",
    avatarClipper: false,
    imagesubjectClipper: false,
    pic: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    let res = util.loginNow();
    if (res == true) {
      let userInfo = wx.getStorageSync('userInfo');
      if (userInfo.user_birthday != "" && userInfo.user_birthday != null) {
        that.setData({
          birth: userInfo.user_birthday,
        })
      }
      that.setData({
        nickName: userInfo.user_name,
        signature: userInfo.user_introduce,
        avatar: userInfo.user_avatar,
        imagesubject: userInfo.user_background_maps
      })
    }
  },

  clipperImage: function (e) {
    this.imageClipper(e.currentTarget.dataset.type);
  },

  addimage: function (e) {
    this.uploadPicturesPic(e.detail.url, e.currentTarget.dataset.name, e.currentTarget.dataset.type);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {},

  signatureChange: function (e) {
    this.setData({
      signature: e.detail.value
    })
  },

  nicknameChange: function (e) {
    this.setData({
      nickName: e.detail.value
    })
  },

  bindDateChange: function (a) {
    this.setData({
      birth: a.detail.value
    });
  },
}
mixins(options)
common(options)
Page(options)