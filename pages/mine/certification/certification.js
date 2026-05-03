const mixins = require('../../../mixins/user')
const common = require('../../../mixins/common')
const app = getApp()
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    notice: true,
    nameMaxLength: 30,
    phoneMaxLength: 30,
    descMaxLength: 300,
    nameLength: 0,
    phoneLength: 0,
    descLength: 0,
    name: "",
    phone: "",
    desc: "",
    imagesubject: null,
    type: 'forum',
    alist: [],
    swiperload: true,
    isA: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.userAuthentication();
  },

  addimage: function (e) {
    this.uploadPictures(1, e.currentTarget.dataset.name);
  },

  delImage() {
    this.setData({
      imagesubject: null
    });
  },

  onInputChange: function (e) {
    var type = e.currentTarget.dataset.type,
      varue = e.detail.value;
    if (1 == type) this.setData({
      name: varue,
      nameLength: varue.length
    });
    else if (2 == type) this.setData({
      phone: varue,
      phoneLength: varue.length
    });
    else if (3 == type) this.setData({
      desc: varue,
      descLength: varue.length
    });
  },

  upAuthentication() {
    this.setData({
      isA: false
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

}

mixins(options)
common(options)
Page(options)