const app = getApp();
const api = require('../config/api');
const util = require('../utils/util');

// 获取用户信息
const loginByWeixin = function () {
  let userInfo = null;
  let code = null;
  return new Promise(function (resolve, reject) {
    return util.login().then((res) => {
      code = res.code;
      return util.getUserProfile();
    }).then((res) => {
      userInfo = res.userInfo;
      return util.getUserInfo();
    }).then((res) => {
      util.request(api.loginUrl, {
        userInfo: userInfo,
        encryptedData: res.encryptedData,
        iv: res.iv,
        code: code
      }, 'POST').then(res => {
        if (res.code === 200) {
          //存储用户token
          wx.setStorageSync('token', res.data.token);
          //存储用户信息
          util.request(api.userInfoUrl).then(function (res) {
            wx.setStorageSync('userInfo', res.data)
            resolve(res.data);
          })
        } else {
          reject(res);
        }
      }).catch((err) => {
        reject(err);
      });
    }).catch((err) => {
      reject(err);
    })
  })
}

//更新用户信息
const updateUserInfo = function () {
  util.request(api.userInfoUrl).then(function (res) {
    wx.setStorageSync('userInfo', res.data)
  })
}

// 修改用户信息
const updateInfo = function (data) {
  let that = this;
  let datas = {
    user_avatar: that.data.avatar,
    user_name: that.data.nickName,
    user_introduce: that.data.signature,
    user_birthday: that.data.birth,
    user_background_maps: that.data.imagesubject,
  }
  util.request(api.updateInfoUrl, datas, "POST").then(function (res) {
    if (res.status) {
      wx.hideLoading();
      wx.showToast({
        title: '保存成功！审核中...',
        icon: 'none'
      })
      return updateUserInfo();
    }
  })
}

//我的帖子/收藏/喜欢
const userPosts = function (currentItem, page) {
  let that = this;
  util.request(api.userPostsUrl, {
    type: currentItem,
    page: page,
  }).then(res => {
    if (res.status) {
      let data = res.data;
      let args = {};
      if (data.data.length <= 0 && page == 1) {
        args.isNul = true;
      }
      if (data.data.length == 0) {
        args.isLastPage = true;
      } else if (currentItem == 0) {
        args.myPostsList = that.data.myPostsList.concat(data.data);
        args.myPostsPage = data.current_page;
      } else if (currentItem == 1) {
        args.myLikePostsList = that.data.myLikePostsList.concat(data.data);
        args.myLikePostsPage = data.current_page;
      } else if (currentItem == 2) {
        args.myCollectionList = that.data.myCollectionList.concat(data.data);
        args.myCollectionPage = data.current_page;
      } else if (currentItem == 3) {
        args.myExceptionalList = that.data.myExceptionalList.concat(data.data);
        args.myExceptionalPage = data.current_page;
      }
      args.posts = that.data.posts.concat(data.data);
      if (that.data.topicload) {
        args.isPullDownRefresh = true;
      }
      args.topicload = false;
      that.setData(args);
    }
  })
}

/**
 * 用户反馈
 */
const userFeedback = function () {
  let that = this;
  let feedback_content = that.data.feedback_content;
  if (feedback_content == '' || feedback_content == null) {
    wx.showToast({
      title: '您还没有填写您的问题和意见哦！',
      icon: 'none'
    })
    return;
  }
  util.request(api.userFeedbackUrl, {
    feedback_type: that.data.feedback_type,
    feedback_content: feedback_content,
  }, "POST").then(function (res) {
    wx.hideLoading();
    wx.showToast({
      title: '反馈成功！',
      icon: 'none'
    })
  })
}

/**
 * 用户认证状态
 */
const userAuthentication = function () {
  let that = this;
  util.request(api.userAuthenticationUrl).then(function (res) {
    let args = {};
    if (res.data == null || res.data == '') {
      args.isA = false;
    } else {
      args.isA = true;
    }
    args.alist = res.data;
    args.swiperload = false;
    that.setData(args);
  })
}

/**
 * 用户认证
 */
const addAuthentication = function () {
  let that = this;
  let name = that.data.name;
  let phone = that.data.phone;
  let desc = that.data.desc;
  let imagesubject = that.data.imagesubject;
  if (name == '' || name == null) {
    wx.showToast({
      title: '请填写名称',
      icon: 'none'
    })
    return;
  }
  if (phone == '' || phone == null) {
    wx.showToast({
      title: '请填写联系方式',
      icon: 'none'
    })
    return;
  }
  if (desc == '' || desc == null) {
    wx.showToast({
      title: '请填写介绍',
      icon: 'none'
    })
    return;
  }
  if (imagesubject == null) {
    wx.showToast({
      title: '请上传身份信息证明图片',
      icon: 'none'
    })
    return;
  }
  util.request(api.userAuthenticationUrl, {
    name: name,
    contact_information: phone,
    introduce: desc,
    identity_picture: imagesubject,
  }, "POST").then(function (res) {
    wx.hideLoading();
    wx.showToast({
      title: '提交成功！',
      icon: 'none'
    })
    return userAuthentication();
  })
}

//用户创建的圈子列表
const userCricle = function () {
  let that = this;
  util.request(api.userCricleUrl).then(function (res) {
    let args = {};
    args.subcats = res.data;
    args.subcatsloading = false;
    that.setData(args)
  })
}

//用户相关帖子count
const userTotalPost = function () {
  let that = this;
  util.request(api.userTotalPostUrl).then(function (res) {
    let args = {};
    let data = that.data.taga;
    data[0].ums = res.data.myTotal;
    data[1].ums = res.data.collecTotal;
    data[2].ums = res.data.likeTotal;
    data[3].ums = res.data.exceptionalTotal;
    args.taga = data;
    that.setData(args)
  })
}

//关注列表
const followUserList = function () {
  let that = this;
  let apiUsl = api.followUserUrl;
  if (that.data.type == 1) {
    apiUsl = api.fansUserUrl;
  }
  util.request(apiUsl, {
    user_id: that.data.userid,
    page: that.data.page,
  }).then(function (res) {
    let data = res.data;
    let args = {};
    if (data.data.length <= 0) {
      args.isLastPage = true;
    }
    args.userList = that.data.userList.concat(data.data);
    args.loadmore = false;
    args.page = data.current_page;
    that.setData(args)
  })
}

//通过用户id获取用户公开信息
const getUserinfoById = function () {
  let that = this;
  util.request(api.getUserinfoByIdUrl, {
    user_id: that.data.userId
  }).then(function (res) {
    let args = {};
    args.userInfo = res.data;
    that.setData(args)
  })
}

//通过用户id获取用户动态
const userPostsById = function () {
  let that = this;
  util.request(api.userPostsByIdUrl, {
    page: that.data.page,
    user_id: that.data.userId
  }).then(function (res) {
    let data = res.data;
    let args = {};
    if (data.data.length < 6) {
      args.isLastPage = true;
    }
    args.posts = that.data.posts.concat(data.data);
    args.topicload = false;
    args.page = data.current_page;
    args.total = data.total;
    that.setData(args);
  })
}

//获取会员价格
const getMembersPrice = function () {
  let that = this;
  util.request(api.getMembersPriceUrl).then(function (res) {
    let args = {};
    if (res.status) {
      args.order_price = res.data;
    } else {
      args.order_price = 999;
    }
    that.setData(args)
  })
}

//获取配置数据
const configData = function () {
  let that = this;
  util.request(api.configDatalUrl).then(function (res) {
    if (res.status) {
      let args = {};
      args.configData = res.data;
      that.setData(args)
    }
  })
}

//用户订单
const myOrder = function () {
  let that = this;
  util.request(api.myOrderUrl, {
    page: that.data.page
  }).then(function (res) {
    if (res.status) {
      let data = res.data;
      let args = {};
      if (data.data.length < 10) {
        args.isLastPage = true;
      }
      args.loading = false;
      args.orderList = that.data.orderList.concat(data.data);
      args.page = data.current_page;
      that.setData(args)
    }
  })
}


//用户收益
const myFinancial = function () {
  let that = this;
  util.request(api.myFinancialUrl).then(function (res) {
    if (res.status) {
      let data = res.data;
      let args = {};
      let withdrawal = that.data.withdrawal;
      args.sumPrice = data.sum_price;
      args.bankName = data.bank_name;
      args.bankId = data.bank_card;
      withdrawal[0].i = data.earnings_yesterday;
      withdrawal[1].i = data.balance;
      withdrawal[2].i = data.withdrawal_price;
      args.withdrawal = withdrawal;
      args.withdrawalBalance = data.balance;
      that.setData(args)
    }
    that.animate();
  })
}

//用户提现列表
const myUserWithdrawal = function () {
  let that = this;
  util.request(api.myUserWithdrawalUrl).then(function (res) {
    if (res.status) {
      let args = {};
      if (res.data.length <= 0) {
        args.isWithdrawal = false;
      }
      args.withdrawalList = res.data;
      that.setData(args)
    }
  })
}

//用户收益列表
const myUserExceptional = function () {
  let that = this;
  util.request(api.myUserExceptionalUrl).then(function (res) {
    if (res.status) {
      let args = {};
      if (res.data.length <= 0) {
        args.isExceptional = false;
      }
      args.exceptionalList = res.data;
      that.setData(args)
    }
  })
}

//用户提现
const withdrawalPay = function () {
  let that = this;
  let price = that.data.price;
  let bankName = that.data.bankName;
  let bankId = that.data.bankId;
  if (price == '' || price == null) {
    wx.showToast({
      title: '请选择提现金额！',
      icon: 'none'
    })
    return;
  }
  if (bankName == '' || bankName == null) {
    wx.showToast({
      title: '请输入支行名称！',
      icon: 'none'
    })
    return;
  }
  if (bankId == '' || bankId == null) {
    wx.showToast({
      title: '请输入银行卡号！',
      icon: 'none'
    })
    return;
  }
  util.request(api.initiateWithdrawalUrl, {
    price: price,
    bank_name: bankName,
    bank_card: bankId,
  }, 'POST').then(function (res) {
    if (res.status) {
      wx.showModal({
        title: '发起提现成功',
        content: '睡醒会在1至3个工作日内您受理，请您耐心等待！',
        showCancel: false,
        confirmText: "朕知道了",
        confirmColor: "#333333",
        success(res) {
          that.setData({
            withdrawalPopup: !that.data.withdrawalPopup
          })
          that.myFinancial();
          that.myUserWithdrawal();
        }
      })
    }
  })
}

//PC登录信息
const pcLogin = function () {
  let that = this;
  util.getNewToken().then(() => {
    util.request(api.pcLoginUrl, {
      token: wx.getStorageSync('token'),
      scene: that.data.scene,
    }).then(function (res) {
      that.setData({
        btnState: false
      })
      wx.reLaunch({
        url: '/pages/tabbar/index/index',
      })
    })
  })
}

module.exports = function (obj) {

  obj.pcLogin = pcLogin;
  obj.myUserExceptional = myUserExceptional;
  obj.myUserWithdrawal = myUserWithdrawal;
  obj.myFinancial = myFinancial;
  obj.myOrder = myOrder;
  obj.withdrawalPay = withdrawalPay;
  obj.loginByWeixin = loginByWeixin;
  obj.updateInfo = updateInfo;
  obj.userPosts = userPosts;
  obj.userTotalPost = userTotalPost;
  obj.updateUserInfo = updateUserInfo;
  obj.userFeedback = userFeedback;
  obj.addAuthentication = addAuthentication;
  obj.userAuthentication = userAuthentication;
  obj.userCricle = userCricle;
  obj.followUserList = followUserList;
  obj.getUserinfoById = getUserinfoById;
  obj.userPostsById = userPostsById;
  obj.getMembersPrice = getMembersPrice;
  obj.configData = configData;
}
