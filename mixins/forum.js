const app = getApp();
const api = require('../config/api');
const util = require('../utils/util');


//添加标签
const getAddTagList = function (tags_name) {
  let that = this;
  util.request(api.tagsAddUrl, {
    tags_name: tags_name
  }, "POST").then(function (res) {
    let userSelectedTags = wx.getStorageSync('userSelectedTags');
    let readsave = true
    // 过滤重复值
    if (userSelectedTags.length > 0) {
      for (let i = 0; i < userSelectedTags.length; i++) {
        if (userSelectedTags[i].id == res.data.id) {
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
      args.id = res.data.id;
      args.tags_name = res.data.tags_name;
      userSelectedTags.unshift(args);
      wx.setStorageSync('userSelectedTags', userSelectedTags);
      that.setData({
        searchInput: '',
        userSelectedTags: userSelectedTags
      })
    }
  })
}

//获取推荐标签
const getTagList = function (args) {
  let that = this;
  util.request(api.tagsRecommendUrl).then(function (res) {
    let args = {};
    if (res.data.length <= 0) {
      args.isNull = false
    }
    args.tags = res.data
    that.setData(args)
  })
}

//发帖
const creatForums = function () {
  let that = this;
  let textinput = that.data.textinput; //帖子内容
  let topicids = that.data.topicids; //圈子id
  let tags = that.data.tags; //标签数组
  let location = that.data.location; // 地址信息
  let image_urls = that.data.image_urls; // 图片地址数组
  let video_url = that.data.video_url; // 视频地址
  let video_thumb_url = that.data.video_thumb_url; // 视频封面
  let video_height = that.data.video_height; // 视频高度
  let video_width = that.data.video_width; // 视频宽度
  if (textinput == "") {
    wx.showToast({
      title: '你还没有说点什么呢',
      icon: 'none'
    })
    return
  }
  if (topicids == "" || topicids == undefined) {
    wx.showToast({
      title: '请选择一个圈子再发布吧',
      icon: 'none'
    })
    return
  }
  wx.showLoading({
    title: '发布中...'
  });
  util.request(api.postAddUrl, {
    posts_content: textinput,
    circle_id: topicids,
    tags: tags,
    address: location,
    image_urls: image_urls,
    video_url: video_url,
    video_thumb_url: video_thumb_url,
    video_height: video_height,
    video_width: video_width,
  }, "POST").then(function (res) {
    wx.hideLoading();
    if (res.code == 200) {
      wx.showModal({
        title: '发布成功',
        content: '睡醒审帖员会在24小时之内您审帖，请您耐心等待！',
        showCancel: false,
        confirmText: "朕知道了",
        confirmColor: "#333333",
        success(res) {
          wx.navigateBack();
        }
      })
    }
  })
}


module.exports = function (obj) {
  obj.getTagList = getTagList;
  obj.getAddTagList = getAddTagList;
  obj.creatForums = creatForums;

}