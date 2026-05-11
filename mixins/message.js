const app = getApp();
const api = require('../config/api');
const util = require('../utils/util');
const socket = require('../utils/socket');

function logMessageError(scope, err) {
  try {
    console.error('[InfiniLink message:' + scope + ']', err);
  } catch (error) {}
}

function normalizeMessageText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return normalizeMessageText(item);
    }).filter(Boolean).join(' ');
  }
  if (value && typeof value === 'object') {
    if (typeof value.content === 'string') {
      return value.content;
    }
    if (typeof value.chat_content === 'string') {
      return value.chat_content;
    }
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (typeof value.title === 'string') {
      return value.title;
    }
    return '';
  }
  return '';
}

function normalizeChatItem(item) {
  if (!item || typeof item !== 'object') {
    return item;
  }
  const next = Object.assign({}, item);
  next.chat_content = normalizeMessageText(item.chat_content);
  if (item.read && typeof item.read === 'object') {
    next.read = Object.assign({}, item.read, {
      chat_content: normalizeMessageText(item.read.chat_content)
    });
  }
  return next;
}

/**
 * 获取消息页数据提示
 */
const getMessages = function () {
  let that = this;
  util.request(api.getMessagesUrl).then(function (res) {
    let mQH = that.data.messageQHList;
    mQH[0].content = normalizeMessageText(res.data[0].noticeSystemText);
    mQH[0].date = res.data[0].noticeSystemDate;
    mQH[0].count = res.data[0].noticeSystemCount;
    mQH[1].content = normalizeMessageText(res.data[1].noticeLikeCollectText);
    mQH[1].date = res.data[1].noticeLikeCollectDate;
    mQH[1].count = res.data[1].noticeLikeCollectCount;
    mQH[2].content = normalizeMessageText(res.data[2].noticeCommentText);
    mQH[2].date = res.data[2].noticeCommentDate;
    mQH[2].count = res.data[2].noticeCommentCount;
    let args = {}
    args.messageQHList = mQH;
    that.setData(args)
  }).catch(function (err) {
    logMessageError('getMessages', err);
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
    args.messageList = (res.data || []).map(function (item) {
      return Object.assign({}, item, {
        content: normalizeMessageText(item.content)
      });
    });
    args.loadmore = false;
    that.setData(args)
  }).catch(function (err) {
    logMessageError('getDetailsMessages', err);
    that.setData({
      messageList: [],
      loadmore: false
    })
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
  let chat_content = typeof that.data.chat_content === 'string' ? that.data.chat_content.trim() : '';
  let chat_image = that.data.chat_image || '';
  if (!chat_content && !chat_image) {
    wx.showToast({
      title: '不讲话，你发送个锤子',
      icon: 'none'
    })
    return
  }

  socket.sendChat(Number(that.data.oid), chat_content, chat_image).then(function () {
    that.setData({
      chat_content: '',
      chat_image: '',
    })
  }).catch(function () {
    util.request(api.addChatUrl, {
      oid: that.data.oid,
      chat_content: chat_content,
      chat_image: chat_image,
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
    }).catch(function (err) {
      logMessageError('toAddChat:requestFallback', err);
      wx.showToast({
        title: "发送失败了!",
        icon: 'none',
        duration: 1500
      })
    })
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
      args.messages = data.data.map(normalizeChatItem).concat((that.data.messages || []).map(normalizeChatItem));
      args.page = data.current_page;
      that.setData(args)
    }
  }).catch(function (err) {
    logMessageError('getUserChat', err);
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
      args.messageList = (res.data || []).filter(function (item) {
        return !Number(item.is_customer_service || 0);
      }).map(normalizeChatItem)
      that.setData(args)
    }
  }).catch(function (err) {
    logMessageError('getUserChatList', err);
    that.setData({
      messageList: []
    })
  })
}

const getCustomerServiceProfile = function () {
  let that = this;
  return util.request(api.customerServiceUrl).then(function (res) {
    if (res.status) {
      that.setData({
        customerServiceThread: normalizeChatItem(res.data)
      })
      return res.data;
    }
    return null;
  }).catch(function (err) {
    logMessageError('getCustomerServiceProfile', err);
    that.setData({
      customerServiceThread: null
    })
    return null;
  })
}

/**
 * 已读对应用户信息
 */
const readUserChat = function () {
  util.request(api.readUserChatUrl, {
    oid: this.data.oid,
  }).then(function (res) {}).catch(function (err) {
    logMessageError('readUserChat', err);
  })
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
  obj.getCustomerServiceProfile = getCustomerServiceProfile;
  obj.readUserChat = readUserChat;
}
