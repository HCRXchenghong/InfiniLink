const mixins = require('../../../mixins/user')
const common = require('../../../mixins/common')
const pay = require('../../../mixins/pay')
var app = getApp();
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    myPostsList: [],
    myLikePostsList: [],
    myCollectionList: [],
    myExceptionalList: [],
    myPostsPage: 1,
    myLikePostsPage: 1,
    myCollectionPage: 1,
    myExceptionalPage: 1,
    isNul: false,
    isPullDownRefresh: false,
    taga: [{
      text: "动态",
      ums: ""
    }, {
      text: "收藏",
      ums: ""
    }, {
      text: "喜欢",
      ums: ""
    }, {
      text: "打赏",
      ums: ""
    }],
    currentItem: 0,
    navbarTrans: 0,
    color: "0,0,0",
    iconTheme: "white",
    emptyTxt: "空",
    posts: [],
    topicload: true,
    imageShow: false,
    configData: {},
    isOnShow: false,
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
    var iconTheme = that.data.iconTheme;
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

  toScanCode() {
    wx.scanCode({
      onlyFromCamera: true,
      success(res) {
        if (typeof (res.path) != "undefined") {
          wx.navigateTo({
            url: '/' + res.path,
          })
        }
      }
    })
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    that.setData({
      customBar: app.globalData.CustomBar
    });
    that.configData();
    if (!that.data.isOnShow) {
      let userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        that.setData({
          userInfo: userInfo,
          posts: [],
          myPostsList: [],
          myLikePostsList: [],
          myCollectionList: [],
          myExceptionalList: [],
          topicload: true,
          loadmoreShow: false,
          isLastPage: false,
          isOnShow: false,
        })
        that.userTotalPost();
        that.userPosts(that.data.currentItem, that.data.myPostsPage);
      } else {
        that.setData({
          isOnShow: true,
        })
        wx.navigateTo({
          url: '/pages/login/login',
        })
      }
    }
  },

  select: function (e) {
    var that = this;
    var type = e.target.dataset.index;
    var emptyTxt = "空";
    if (type != 0) {
      emptyTxt = "干净清爽";
    }
    that.setData({
      currentItem: type,
      emptyTxt: emptyTxt,
      isNul: false,
      topicload: true,
      loadmoreShow: false,
      isLastPage: false,
    })
    let args = {};
    if (type == 0) {
      if (that.data.myPostsList.length <= 0) {
        args.posts = [];
        that.userPosts(type, that.data.myPostsPage);
      } else {
        args.posts = that.data.myPostsList;
      }
    } else if (type == 1) {
      if (that.data.myLikePostsList.length <= 0) {
        args.posts = [];
        that.userPosts(type, that.data.myLikePostsPage);
      } else {
        args.posts = that.data.myLikePostsList;
      }
    } else if (type == 2) {
      if (that.data.myCollectionList.length <= 0) {
        args.posts = [];
        that.userPosts(type, that.data.myCollectionPage);
      } else {
        args.posts = that.data.myCollectionList;
      }
    } else if (type == 3) {
      if (that.data.myExceptionalList.length <= 0) {
        args.posts = [];
        that.userPosts(type, that.data.myExceptionalPage);
      } else {
        args.posts = that.data.myExceptionalList;
      }
    }
    args.topicload = false;
    that.setData(args);
  },

  addTap() {
    wx.navigateTo({
      url: '/pages/creat/creat',
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    "function" == typeof this.getTabBar && this.getTabBar() && this.getTabBar().setData({
      selected: 4
    })
    let that = this;
    that.getSysMessageCount().then(function (res) {
      that.getTabBar().setData({
        sysMessageCount: res
      })
    })
    if (that.data.isOnShow) {
      let userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        that.setData({
          userInfo: userInfo,
          posts: [],
          myPostsList: [],
          myLikePostsList: [],
          myCollectionList: [],
          myExceptionalList: [],
          topicload: true,
          loadmoreShow: false,
          isLastPage: false,
          isNul: false,
          isOnShow: false,
        })
        that.userTotalPost();
        that.userPosts(that.data.currentItem, that.data.myPostsPage);
      } else {
        that.setData({
          isOnShow: true,
        })
        wx.navigateTo({
          url: '/pages/login/login',
        })
      }
    }
  },

  popupShowTap(e) {
    this.setData({
      typeShow: e.currentTarget.dataset.type,
      imageShow: !this.data.imageShow,
    })
  },

  toVipTap() {
    this.setData({
      isOnShow: true,
    })
    wx.navigateTo({
      url: '/pages/mine/members/members',
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.updateUserInfo();
    that.setData({
      posts: [],
      myPostsList: [],
      myLikePostsList: [],
      myCollectionList: [],
      myExceptionalList: [],
      topicload: true,
      loadmoreShow: false,
      isLastPage: false,
      isNul: false,
    })
    that.userPosts(that.data.currentItem, 1);
    that.userTotalPost();
    setTimeout(function () {
      that.setData({
        userInfo: wx.getStorageSync('userInfo')
      })
    }, 500)
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
    let type = that.data.currentItem;
    that.setData({
      loadmoreShow: true,
      isLastPage: false,
    })
    let page = 1;
    if (type == 0) {
      page = that.data.myPostsPage + 1;
    } else if (type == 1) {
      page = that.data.myLikePostsPage + 1;
    } else if (type == 2) {
      page = that.data.myCollectionPage + 1;
    } else if (type == 3) {
      page = that.data.myExceptionalPage + 1;
    }
    that.userPosts(type, page);
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function (res) {
    if (res && res.from == "button") {
      return {
        title: "轻航",
        path: '/pages/sticky/sticky?id=' + this.data.postsId,
        imageUrl: '',
      }
    } else {
      return {
        title: "轻航",
        path: '/pages/tabbar/mine/mine',
        imageUrl: '',
      }
    }
  }
}
pay(options)
mixins(options)
common(options)
Page(options)
