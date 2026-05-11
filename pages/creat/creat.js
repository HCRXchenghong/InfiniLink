const common = require('../../mixins/common')
const forum = require('../../mixins/forum')
const membership = require('../../utils/membership')
var app = getApp();

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    type: 'forums',
    menusMix: ["/image/link.png"],
    menus: [{
      id: 0,
      icon: "/image/image-line.png",
      text: "图片"
    }, {
      id: 1,
      icon: "/image/live-line.png",
      text: "视频"
    }],
    mediaType: -1,
    pictureMax: 9,
    format: 'standard',
    image_urls: [],
    tags: [],
    location: {},
    textinput: "",
    textLength: 0,
    textLengthMix: 1000,
    topicids: "",
    topic: "",
    video_url: "",
    video_thumb_url: "",
    video_height: 0,
    video_width: 0,
    locationState: true,
    linkPopup: false,
    linkName: "",
    linkAdds: "https://",
    cursor: 0,
    membershipPostPrompt: null,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {},

  onMembershipPostActionTap(e) {
    if (!this.data.user) {
      wx.navigateTo({
        url: '/pages/login/login',
      })
      return;
    }
    const action = e.currentTarget.dataset.action;
    const scene = e.currentTarget.dataset.scene;
    const route = membership.resolveMembershipActionRoute(action, scene);
    if (!route) {
      return;
    }
    wx.navigateTo({
      url: route,
    })
  },

  // 菜单点击
  onMenuItem: function (e) {
    if (!this.data.user) {
      wx.navigateTo({
        url: '/pages/login/login',
      })
      return;
    }
    var i = e.currentTarget.dataset.index,
      type = this.data.menus[i];
    switch (type.id) {
      case 0:
        this.setData({
          format: 'standard',
        })
        this.uploadPictures(2, 'url');
        break;
      case 1:
        this.uploadPictures(3, 'video_url');
        this.setData({
          format: 'video',
        })
        break;
      default:
        console.log("发生了一个意料之外的错误")
    }
  },

  // 菜单点击
  onMixMenuItem: function (e) {
    if (!this.data.user) {
      wx.navigateTo({
        url: '/pages/login/login',
      })
      return;
    }
    let type = e.currentTarget.dataset.index;
    switch (type) {
      case 0:
        this.toAddLink();
        break;
      default:
        console.log("发生了一个意料之外的错误")
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    let that = this;
    let userSelectedCircle = wx.getStorageSync('userSelectedCircle');
    let userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      wx.showToast({
        title: '请先登录',
      })
      wx.navigateTo({
        url: '/pages/login/login',
      })
    }
    that.setData({
      user: userInfo || null,
      tags: wx.getStorageSync('userSelectedTags'),
      membershipPostPrompt: membership.buildPostPrompt(userInfo),
    })
    if (userSelectedCircle != '') {
      that.setData({
        topicids: userSelectedCircle.id,
        topic: userSelectedCircle.name,
      })
    }
  },

  // 获取用户输入帖子内容
  onContentInput: function (e) {
    this.setData({
      textLength: e.detail.value.length,
      textinput: e.detail.value,
      cursor: e.detail.cursor
    })
  },
  //打开/关闭添加链接弹窗
  toAddLink() {
    let that = this;
    that.setData({
      linkPopup: !that.data.linkPopup
    })
  },
  //监听链接输入
  onLinkInput(e) {
    let that = this;
    let type = e.currentTarget.dataset.type;
    let args = {};
    if (type == 0) {
      args.linkName = e.detail.value
    } else {
      args.linkAdds = e.detail.value
    }
    that.setData(args)
  },

  //输入框失去焦点时触发
  bCursor(e) {
    this.setData({
      cursor: e.detail.cursor
    })
  },

  //添加链接
  openAddLink() {
    let that = this;
    let textinput = that.data.textinput;
    let linkName = that.data.linkName;
    let linkAdds = that.data.linkAdds;
    if (linkName == '' || linkName == null) {
      wx.showToast({
        title: '请填写链接显示名称',
        icon: 'none'
      })
      return
    }
    if (linkAdds == '' || linkAdds == "https://" || linkAdds == null) {
      wx.showToast({
        title: '请填写链接地址',
        icon: 'none'
      })
      return
    }
    let cursor = that.data.cursor;
    let postsContent = '';
    console.log("😁", cursor, textinput.length)
    if (cursor == 0) {
      postsContent += '<a href="' + linkAdds + '">' + linkName + '</a>';
    } else if (cursor >= textinput.length) {
      postsContent += textinput + '<a href="' + linkAdds + '">' + linkName + '</a>';
    } else {
      for (let i = 0; i < textinput.length; i++) {
        if (i == cursor) {
          postsContent += '<a href="' + linkAdds + '">' + linkName + '</a>';
        }
        postsContent += textinput[i];
      }
    }
    that.setData({
      textinput: postsContent,
      linkPopup: !that.data.linkPopup,
      linkName: "",
      linkAdds: "https://",
    })
  },
  //继续添加图片
  addPictures() {
    let that = this;
    let pictureMax = 9 - that.data.image_urls.length;
    this.uploadPictures(2, pictureMax);
  },

  //删除图片
  onPictureDelete: function (e) {
    var index = e.currentTarget.dataset.index;
    this.data.image_urls.splice(index, 1), 0 == this.data.image_urls.length && (this.data.mediaType = -1),
      this.setData({
        mediaType: this.data.mediaType,
        image_urls: this.data.image_urls
      });
  },

  //删除视频
  onVideoDelete() {
    this.setData({
      mediaType: -1,
      video_url: "",
      video_thumb_url: "",
      video_height: 0,
      video_width: 0,
    });
  },

  //选择圈子
  onTopicClick: function () {
    wx.navigateTo({
      url: '/pages/creat/circle',
    })
  },

  // 选择位置
  onLocationClick: function () {
    var that = this;
    this.checkPermission("scope.userLocation", "请到设置页面授权“位置信息”权限", function () {
      that.startChooseLocation();
    });
  },
  startChooseLocation: function () {
    var that = this;
    wx.chooseLocation({
      success: function (a) {
        let location = {};
        location.latitude = a.latitude;
        location.longitude = a.longitude;
        location.address_name = a.address;
        location.address_detailed = a.name;
        that.setData({
          location: location,
          locationState: false
        });
      }
    });
  },

  // 清空位置
  delAddsTap() {
    this.setData({
      location: {},
      locationState: true
    });
  },

  // 选择标签
  onTagClick: function () {
    wx.navigateTo({
      url: '/pages/creat/tags'
    })
  },

}
common(options);
forum(options);
Page(options);
