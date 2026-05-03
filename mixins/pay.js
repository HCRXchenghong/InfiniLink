const app = getApp();
const api = require('../config/api');
const util = require('../utils/util');

/**
 * 微信支付相关服务
 */
const payOrder = function (payParam) {
    return new Promise(function (resolve, reject) {
        wx.requestPayment({
            'timeStamp': payParam.timeStamp,
            'nonceStr': payParam.nonceStr,
            'package': payParam.package,
            'signType': payParam.signType,
            'paySign': payParam.paySign,
            'success': function (res) {
                resolve(res);
            },
            'fail': function (res) {
                reject(res);
            },
            'complete': function (res) {
                reject(res);
            }
        });
    });
}

//开通会员
const openMembershipAccount = function () {
    let that = this;
    util.request(api.orderUrl, {
        type: 1
    }, "POST").then(function (res) {
        if (res.status) {
            that.payOrder(res.data).then(function (res) {
                wx.showToast({
                    title: '开通成功！',
                    icon: 'none',
                    duration: 1500
                })
                //更新用户信息
                util.request(api.userInfoUrl).then(function (res) {
                    wx.setStorageSync('userInfo', res.data);
                    wx.navigateBack();
                })
            }).catch(err => {
                console.log("err", err)
            });
        } else {
            wx.showToast({
                title: '发生了一个意料之外的错误，请联系官方客服进行反馈吧。',
                icon: 'none',
                duration: 1500
            })
        }
    })
}

//打赏
const openExceptionalAccount = function () {
    var reg = /(^[1-9]([0-9]+)?(\.[0-9]{1,2})?$)|(^(0){1}$)|(^[0-9]\.[0-9]([0-9])?$)/;
    let that = this;
    let rewardPrice = that.data.rewardPrice;
    let postsId = that.data.postsId;
    let postsUserId = that.data.postsUserId;
    if (!reg.test(rewardPrice)) {
        wx.showToast({
            title: '请输入一个正确的打赏金额',
            icon: 'none'
        })
    } else if (rewardPrice < 1 || rewardPrice > 1000) {
        wx.showToast({
            title: '打赏金额必须在1-1000',
            icon: 'none'
        })
    } else {
        let parame = {};
        parame.rewardPrice = rewardPrice;
        parame.postsId = postsId;
        parame.postsUserId = postsUserId;
        util.request(api.orderUrl, {
            type: 2,
            parame: parame
        }, "POST").then(function (res) {
            if (res.status) {
                that.payOrder(res.data).then(function (res) {
                    wx.showToast({
                        title: '打赏成功！',
                        icon: 'none',
                        duration: 1500
                    })
                    that.setData({
                        rewardPopup: !that.data.rewardPopup
                    })
                }).catch(err => {
                    console.log("err", err)
                });
            } else {
                wx.showToast({
                    title: '发生了一个意料之外的错误，请联系官方客服进行反馈吧。',
                    icon: 'none',
                    duration: 1500
                })
            }
        })
    }
}

module.exports = function (obj) {
    obj.payOrder = payOrder;
    obj.openMembershipAccount = openMembershipAccount;
    obj.openExceptionalAccount = openExceptionalAccount;

};