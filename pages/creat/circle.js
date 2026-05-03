const mixins = require('../../mixins/circle')
const app = getApp()

const options = {
  /**
   * 页面的初始数据
   */
  data: {
    focus: false,
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
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.setData({
      focus: options.focus
    })
    this.plateList();
    this.circleByplateid(-1);
  },

  switchRightTab: function (e) {
    var id = e.target.dataset.id,
      ids = parseInt(e.target.dataset.index);
    this.setData({
      subcatsloading: true,
      curIndex: ids,
      scrollTop: 0,
    });
    this.circleByplateid(id);
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

  },

  choiceTap: function (e) {
    let userSelectedCircle = {};
    userSelectedCircle.id = e.currentTarget.dataset.id;
    userSelectedCircle.name = e.currentTarget.dataset.name;
    wx.setStorageSync('userSelectedCircle', userSelectedCircle);
    wx.navigateBack();
  },

}

mixins(options)
Page(options)