const mixins = require('../../mixins/circle')
const common = require('../../mixins/common')
const pay = require('../../mixins/pay')
const app = getApp()
import config from "../../utils/config";
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    navbarTrans: 0,
    color: "0,0,0",
    iconTheme: "white",
    showmenu: false,
    scrollTop: 0,
    circleInfo: [],
    circleUser: [],
    tabData: ["最新", "热门"],
    swithBarIndex: 0,
    posts: [],
    postsList: [],
    newPostsList: [],
    postsPage: 1,
    newPostsPage: 1,
    isNul: false,
    topicload: true,
    loadmoreShow: false,
    isLastPage: false,
    isPullDownRefresh: false,
    downWidth: 655,
    down: 1,
    isIntroduce: true,
    // 文章组件参数
    focus: false,
    isCommentPage: false,
    inputValue: '',
    imageValue: '',
    ad: config.nativeAd,
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
    //发帖按钮
    //判断浏览器滚动条上下滚动
    if (e.scrollTop > that.data.scrollTop) {
      //向下滚动
      if (!that.data.showmenu) {
        that.setData({
          showmenu: true
        });
      }
    } else {
      //向上滚动
      if (that.data.showmenu) {
        that.setData({
          showmenu: false
        });
      }
    }
    that.data.scrollTop = e.scrollTop;
  },

  downTap() {
    let that = this;
    that.setData({
      downWidth: 690,
      down: 999,
      isIntroduce: false
    })
  },

  //点击发帖按钮
  plusClickAction: function plusClickAction(e) {
    if (this.data.showmenu) {
      this.setData({
        showmenu: false
      });
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    that.setData({
      id: options.id,
      customBar: app.globalData.CustomBar
    })
    that.circleInfo(options.id);
    that.getCircleUserList(options.id);
    that.postsByCircleId(options.id, that.data.swithBarIndex, that.data.postsPage)
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {},

  //切换
  onHandleClick: function (e) {
    let that = this;
    const index = e.currentTarget.dataset.index;
    that.setData({
      swithBarIndex: index,
      isNul: false,
      topicload: true,
      loadmoreShow: false,
      isLastPage: false
    })
    let args = {};
    if (index == 0) {
      if (that.data.postsList.length <= 0) {
        args.posts = [];
        that.postsByCircleId(that.data.id, index, that.data.postsPage);
      } else {
        args.posts = that.data.postsList;
      }
    } else if (index == 1) {
      if (that.data.newPostsList.length <= 0) {
        args.posts = [];
        that.postsByCircleId(that.data.id, index, that.data.newPostsPage);
      } else {
        args.posts = that.data.newPostsList;
      }
    }
    args.topicload = false;
    that.setData(args);
  },

  //前往发帖
  gotoPost: function (e) {
    let userSelectedCircle = {};
    userSelectedCircle.id = e.currentTarget.dataset.id;
    userSelectedCircle.name = e.currentTarget.dataset.name;
    wx.setStorageSync('userSelectedCircle', userSelectedCircle);
    wx.navigateTo({
      url: '/pages/creat/creat?topic',
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.setData({
      posts: [],
      postsList: [],
      newPostsList: [],
      topicload: true,
      loadmoreShow: false,
      isLastPage: false,
    })
    that.circleInfo(that.data.id);
    that.getCircleUserList(that.data.id);
    that.postsByCircleId(that.data.id, that.data.swithBarIndex, 1)
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
    let type = that.data.swithBarIndex;
    that.setData({
      loadmoreShow: true,
      isLastPage: false,
    })
    let page = 0;
    if (type == 0) {
      page = that.data.postsPage + 1;
    } else if (type == 1) {
      page = that.data.newPostsPage + 1;
    }
    that.postsByCircleId(that.data.id, type, page);
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function (res) {
    if (res.from == "button") {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/sticky/sticky?id=' + this.data.postsId,
        imageUrl: '',
      }
    } else {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/circle/list',
        imageUrl: '',
      }
    }
  },
  //刷新方法
  refreshEvent() {
    this.onPullDownRefresh();
  },
}

pay(options)
mixins(options)
common(options)
Page(options)