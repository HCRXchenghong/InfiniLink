const common = require('../../mixins/common')
const pay = require('../../mixins/pay')
const app = getApp()
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    maxLen: 200,
    searchViewVisible: true,
    tabs: [{
        title: "内容",
        tabIndex: 0,
        cont: 0,
      }, {
        title: "圈子",
        tabIndex: 1,
        cont: 0,
      },
      {
        title: "用户",
        tabIndex: 2,
        cont: 0,
      },
    ],
    currentData: 0,
    topicload: true,
    posts: [],
    loadmoreShow: false,
    isLastPage: false,
    postsPage: 1,
    cats: [],
    catsPage: 1,
    userList: [],
    userPage: 1,
    page: 1,
    hots: [],
    isNull: false,
    // 文章组件参数
    focus: false,
    isCommentPage: false,
    inputValue: '',
    imageValue: '',
    delSearchS: false,
    myhots: [],
    myhotsSat: true,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.loadOperationAd('feed_stream');
    this.searchHotList();
    this.mySearchList();
  },

  //储存用户输入的搜索词
  onSearchInput: function (e) {
    this.setData({
      keyword: e.detail.value
    })
  },

  //清空搜索词
  onClearBtnClick() {
    this.setData({
      keyword: '',
      searchViewVisible: true
    })
    this.mySearchList();
  },

  //切换搜索
  checkCurrent: function (e) {
    let that = this;
    let type = e.currentTarget.dataset.index;
    that.setData({
      currentData: type,
      isNull: false
    })
    let page = 0;
    if (type == 0 && that.data.posts.length <= 0) {
      page = that.data.postsPage;
    } else if (type == 1 && that.data.cats.length <= 0) {
      page = that.data.catsPage;
    } else if (type == 2 && that.data.userList.length <= 0) {
      page = that.data.userPage;
    }
    if (page != 0) {
      that.setData({
        topicload: true,
        page: page,
        loadmoreShow: false,
      })
      that.indexSearch();
    }
  },

  //搜索
  onSearchConfirm: function () {
    let that = this;
    that.setData({
      page: 1,
      posts: [],
      postsPage: 1,
      cats: [],
      catsPage: 1,
      userList: [],
      userPage: 1,
      isNull: false,
      loadmoreShow: false
    })
    that.indexSearch();
    that.searchCount();
  },

  //取消返回页面
  onCancelBtnClick: function () {
    wx.navigateBack()
  },

  //热门搜索点击事件
  searchStat: function (e) {
    let keyword = e.currentTarget.dataset.name;
    this.setData({
      keyword: keyword,
      posts: [],
      postsPage: 1,
      cats: [],
      catsPage: 1,
      userList: [],
      userPage: 1,
      popupshow: false,
      isNull: false,
    })
    this.indexSearch();
    this.searchCount();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    let that = this;
    let type = that.data.currentData;
    let page = 1;
    if (type == 0) {
      page = that.data.postsPage + 1;
    } else if (type == 1) {
      page = that.data.catsPage + 1;
    } else if (type == 2) {
      page = that.data.userPage + 1;
    }
    that.setData({
      loadmoreShow: true,
      isLastPage: false,
      page: page,
    })
    that.indexSearch();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function (res) {
    if (res && res.from == "button") {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/sticky/sticky?id=' + this.data.postsId,
        imageUrl: '',
      }
    } else {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/search/search',
        imageUrl: '',
      }
    }
  },

  delSearch() {
    this.setData({
      delSearchS: !this.data.delSearchS
    })
  },
}

pay(options)
common(options)
Page(options)
