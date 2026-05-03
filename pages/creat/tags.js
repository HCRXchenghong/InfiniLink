const common = require('../../mixins/forum')

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    page: 1,
    isNull: true,
    tags: [],
    userSelectedTags: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.getTagList();
  },

  addtag: function (e) {
    this.setData({
      searchStr: e.detail.value,
    })
  },

  /**
   * 添加标签 
   * */
  searchTag: function () {
    let that = this;
    let userSelectedTags = wx.getStorageSync('userSelectedTags');
    if (userSelectedTags.length > 8) {
      wx.showToast({
        title: "最多只能添加8个标签",
        icon: 'none'
      })
      return
    }
    if (that.data.searchStr.length > 10) {
      wx.showToast({
        title: "标签应小于10个字",
        icon: 'none'
      })
      return
    }
    that.getAddTagList(that.data.searchStr);
  },

  addTags: function (e) {
    let that = this;
    let userSelectedTags = wx.getStorageSync('userSelectedTags');
    let id = e.currentTarget.dataset.id;
    let name = e.currentTarget.dataset.name;
    let readsave = true
    // 过滤重复值
    if (userSelectedTags.length > 0) {
      for (let i = 0; i < userSelectedTags.length; i++) {
        if (userSelectedTags[i].id == id) {
          readsave = false
          wx.showToast({
            title: "您已经添加过该标签了",
            icon: 'none'
          })
          break;
        }
      }
    }
    if (readsave) {
      let args = {}
      args.id = id;
      args.tags_name = name;
      userSelectedTags.unshift(args);
      wx.setStorageSync('userSelectedTags', userSelectedTags);
      that.setData({
        userSelectedTags: userSelectedTags
      })
    }
  },

  /**
   * 删除标签
   */
  removeTag: function (e) {
    let that = this;
    let id = e.currentTarget.dataset.id;
    let list = wx.getStorageSync('userSelectedTags');
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list.splice(i, 1)
      }
    }
    wx.setStorageSync('userSelectedTags', list);
    that.setData({
      userSelectedTags: list
    })
  },

  activityClear: function () {
    this.setData({
      searchStr: '',
    })
  },

  save() {
    wx.navigateBack();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    let userSelectedTags = wx.getStorageSync('userSelectedTags');
    if (userSelectedTags.length <= 0) {
      wx.setStorageSync('userSelectedTags', this.data.userSelectedTags);
    } else {
      this.setData({
        userSelectedTags: userSelectedTags
      })
    }
  },

}
common(options);
Page(options);