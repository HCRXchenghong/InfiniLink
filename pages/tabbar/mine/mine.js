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
    userInfo: {
      user_name: '',
      user_avatar: '',
      user_background_maps: '',
      user_introduce: '',
      is_official: 0,
      is_authentication: 0,
      is_member: 0,
      membership_active: 0,
      membership_tier: '',
      membership_expire_text: '',
      follow_count: 0,
      follow_user_count: 0,
      like_count: 0,
      level_no: 1,
      level_label: 'LV1',
    },
    isOnShow: false,
    scrollTop: 0,
    customBar: 0,
    // 文章组件参数
    focus: false,
    isCommentPage: false,
    inputValue: '',
    imageValue: ''
  },

  syncMineUserState(userInfo) {
    const nextUserInfo = userInfo && typeof userInfo === 'object' ? userInfo : this.data.userInfo;
    this.setData({
      userInfo: nextUserInfo
    })
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
      customBar: Number(app.globalData.CustomBar || 0)
    });
    that.configData();
    that.loadOperationAd('feed_stream');
    if (!that.data.isOnShow) {
      let userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        that.setData({
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
        that.syncMineUserState(userInfo);
        that.updateUserInfo().then(function (nextUserInfo) {
          if (nextUserInfo) {
            that.syncMineUserState(nextUserInfo);
          }
        });
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
    let cachedUserInfo = wx.getStorageSync('userInfo')
    if (cachedUserInfo) {
      that.syncMineUserState(cachedUserInfo);
      that.updateUserInfo().then(function (nextUserInfo) {
        if (nextUserInfo) {
          that.syncMineUserState(nextUserInfo);
        }
      });
    }
    that.getSysMessageCount().then(function (res) {
      const tabBar = typeof that.getTabBar === 'function' ? that.getTabBar() : null;
      if (tabBar) {
        tabBar.setData({
          sysMessageCount: res
        })
      }
    })
    if (that.data.isOnShow) {
      let userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
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
          isOnShow: false,
        })
        that.syncMineUserState(userInfo);
        that.updateUserInfo().then(function (nextUserInfo) {
          if (nextUserInfo) {
            that.syncMineUserState(nextUserInfo);
          }
        });
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

  openLevelDetail() {
    wx.navigateTo({
      url: '/pages/mine/level/level',
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
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
    that.updateUserInfo().then(function (nextUserInfo) {
      if (nextUserInfo) {
        that.syncMineUserState(nextUserInfo);
      }
    });
    that.userPosts(that.data.currentItem, 1);
    that.userTotalPost();
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
        title: "InfiniLink",
        path: '/pages/sticky/sticky?id=' + this.data.postsId,
        imageUrl: '',
      }
    } else {
      return {
        title: "InfiniLink",
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
