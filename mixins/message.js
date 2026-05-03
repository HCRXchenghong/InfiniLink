const app = getApp();
const api = require('../config/api');
const util = require('../utils/util');

/**
 * 获取消息页数据提示
 */
const getMessages = function () {
  let that = this;
  util.request(api.getMessagesUrl).then(function (res) {
    let mQH = that.data.messageQHList;
    mQH[0].content = res.data[0].noticeSystemText;
    mQH[0].date = res.data[0].noticeSystemDate;
    mQH[0].count = res.data[0].noticeSystemCount;
    mQH[1].content = res.data[1].noticeLikeCollectText;
    mQH[1].date = res.data[1].noticeLikeCollectDate;
    mQH[1].count = res.data[1].noticeLikeCollectCount;
    mQH[2].content = res.data[2].noticeCommentText;
    mQH[2].date = res.data[2].noticeCommentDate;
    mQH[2].count = res.data[2].noticeCommentCount;
    let args = {}
    args.messageQHList = mQH;
    that.setData(args)
  })
}

/**
 * 系统通知页数据
 */
const getDetailsMessages = function (type) {
  let that = this;
  util.request(api.getDetailsMessagesUrl, {
    type: type
  }).then(function (res) {
    let args = {}
    if (res.data.length <= 0) {
      args.isNull = false;
    }
    args.messageList = res.data;
    args.loadmore = false;
    that.setData(args)
  })
}

/**
 * 清除用户全部未读系统通知
 */
const readMessages = function (type) {
  util.request(api.readMessagesUrl, {
    type: type
  }).then(function (res) {})
}

//跳转帖子详情页
const toPostsDetail = function (e) {
  wx.navigateTo({
    url: '/pages/sticky/sticky?id=' + e.currentTarget.dataset.id,
  })
}

//发起聊天
const toAddChat = function () {
  let that = this;
  let chat_content = that.data.chat_content;
  String.prototype.trim = function () {
    return this.replace(/(^\s*)|(\s*$)/g, '');
  }
  if (typeof chat_content == "undefined" || chat_content == null || chat_content.trim() == "") {
    wx.showToast({
      title: '不讲话，你发送个锤子',
      icon: 'none'
    })
    return
  }
  util.request(api.addChatUrl, {
    oid: that.data.oid,
    chat_content: chat_content,
    chat_image: that.data.chat_image,
  }, "POST").then(function (res) {
    if (res.status) {
      that.setData({
        chat_content: '',
        chat_image: '',
      })
      that.getUserChat(1);
    } else {
      wx.showToast({
        title: "发送失败了!",
        icon: 'none',
        duration: 1500
      })
    }
  })
}

//发送图片
const toAddChatImage = function () {
  let that = this;
  wx.chooseImage({
    count: 1,
    sourceType: ['album', 'camera'],
    success(res) {
      const tempFilePaths = res.tempFilePaths;
      util.uploadFile(api.uploadsUrl, tempFilePaths[0]).then(function (res) {
        that.setData({
          chat_image: res.data
        })
        that.toAddChat();
      })
    },
  })
}

/**
 * 查询用户聊天记录
 */
const getUserChat = function (type) {
  let that = this;
  util.request(api.getUserChatUrl, {
    oid: that.data.oid,
    page: that.data.page,
  }).then(function (res) {
    if (res.status) {
      if (type == 1) {
        that.setData({
          page: 1,
          messages: []
        })
      }
      let data = res.data;
      data.data.reverse();
      let args = {}
      args.messages = data.data.concat(that.data.messages);
      args.page = data.current_page;
      that.setData(args)
    }
  })
}

/**
 * 查询用户聊天记录列表
 */
const getUserChatList = function () {
  let that = this;
  util.request(api.getUserChatListUrl).then(function (res) {
    if (res.status) {
      let args = {}
      args.messageList = res.data
      that.setData(args)
    }
  })
}

/**
 * 已读对应用户信息
 */
const readUserChat = function () {
  util.request(api.readUserChatUrl, {
    oid: this.data.oid,
  }).then(function (res) {})
}

//删除聊天记录
const delMessage = function (e) {
  let that = this;
  util.request(api.userDelMessageUrl, {
    userid: e.currentTarget.dataset.uid,
  }).then(function (res) {
    that.setData({
      close: true
    })
    that.getUserChatList();
  })
}



module.exports = function (obj) {

  obj.delMessage = delMessage;
  obj.getMessages = getMessages;
  obj.getDetailsMessages = getDetailsMessages;
  obj.readMessages = readMessages;
  obj.toPostsDetail = toPostsDetail;
  obj.toAddChat = toAddChat;
  obj.toAddChatImage = toAddChatImage;
  obj.getUserChat = getUserChat;
  obj.getUserChatList = getUserChatList;
  obj.readUserChat = readUserChat;
}