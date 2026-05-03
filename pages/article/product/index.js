Component({
  /**
   * 组件的属性列表
   */
  properties: {
    data: Object
  },

  /**
   * 组件的初始数据
   */
  data: {

  },

  /**
   * 组件的方法列表
   */
  methods: {
    toPostsDetail(e) {
      wx.navigateTo({
        url: '/pages/sticky/sticky?id=' + e.currentTarget.dataset.id,
      })
    },

    toUser(e) {
      wx.navigateTo({
        url: '/pages/user/user?id=' + e.currentTarget.dataset.id,
      })
    }
  }
});