const app = getApp();
const api = require('../config/api');
const util = require('../utils/util');
const levelUtils = require('../utils/level');

function normalizeMembershipCacheUser(user) {
    const nextUser = user && typeof user === 'object' ? Object.assign({}, user) : {};
    const expiresAt = typeof nextUser.membership_expires_at === 'string' ? nextUser.membership_expires_at : '';
    let isMember = Number(nextUser.is_member || nextUser.membership_active || 0) === 1;
    if (isMember && expiresAt) {
        const expireTs = Date.parse(expiresAt);
        if (!Number.isNaN(expireTs) && expireTs <= Date.now()) {
            isMember = false;
        }
    }
    nextUser.is_member = isMember ? 1 : 0;
    nextUser.membership_active = nextUser.is_member;
    nextUser.membership_tier = nextUser.is_member ? String(nextUser.membership_tier || 'pro').toLowerCase() : '';
    nextUser.level_no = Math.max(1, Number(nextUser.level_no || 1));
    nextUser.level_label = nextUser.level_label || ('LV' + nextUser.level_no);
    nextUser.level_next_no = Math.max(nextUser.level_no, Number(nextUser.level_next_no || nextUser.level_no));
    nextUser.level_next_label = nextUser.level_next_label || ('LV' + nextUser.level_next_no);
    return levelUtils.decorateLevelUser(nextUser);
}

/**
 * 微信支付相关服务
 */
function resolveClientPaymentPayload(payParam) {
    if (payParam && payParam.payment_payload && typeof payParam.payment_payload === 'object') {
        return payParam.payment_payload;
    }
    if (payParam && payParam.paymentPayload && typeof payParam.paymentPayload === 'object') {
        return payParam.paymentPayload;
    }
    if (payParam && payParam.client_payload && typeof payParam.client_payload === 'object') {
        return payParam.client_payload;
    }
    if (payParam && payParam.clientPayload && typeof payParam.clientPayload === 'object') {
        return payParam.clientPayload;
    }
    return payParam;
}

function navigateToIfPayAuth(authUrl) {
    if (!authUrl) {
        return;
    }
    wx.navigateTo({
        url: '/pages/web-view/index?url=' + encodeURIComponent(authUrl)
    });
}

const payOrder = function (payParam) {
    return new Promise(function (resolve, reject) {
        if (payParam && (payParam.mockPaid || payParam.gateway === 'mock')) {
            resolve(payParam);
            return;
        }
        if (payParam && (payParam.oauth_bind_required || payParam.status === 'requires_oauth_bind')) {
            wx.showToast({
                title: '请先完成 IF-Pay 授权',
                icon: 'none',
                duration: 1800
            });
            navigateToIfPayAuth(payParam.auth_url || payParam.authUrl);
            reject({
                ifpayAuthRequired: true
            });
            return;
        }
        if (payParam && payParam.payment_method === 'ifpay' && (payParam.status === 'success' || payParam.status === 'paid' || payParam.status === 'completed')) {
            resolve(payParam);
            return;
        }
        const clientPayload = resolveClientPaymentPayload(payParam);
        if (!clientPayload || typeof clientPayload !== 'object') {
            reject({
                message: '支付参数异常'
            });
            return;
        }
        if (!(clientPayload.timeStamp && clientPayload.nonceStr && clientPayload.package)) {
            if (payParam && payParam.payment_method === 'ifpay') {
                wx.showToast({
                    title: '支付已发起，请稍后查看状态',
                    icon: 'none',
                    duration: 1800
                });
                resolve(payParam);
                return;
            }
            reject({
                message: '缺少拉起支付参数'
            });
            return;
        }
        wx.requestPayment({
            'timeStamp': clientPayload.timeStamp,
            'nonceStr': clientPayload.nonceStr,
            'package': clientPayload.package,
            'signType': clientPayload.signType,
            'paySign': clientPayload.paySign,
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
    const selectedPlanCode = that.data && that.data.selectedMembershipPlan ? that.data.selectedMembershipPlan : 'pro';
    util.request(api.orderUrl, {
        type: 1,
        payment_method: 'ifpay',
        sub_method: 'wechat',
        platform: 'mini_program',
        parame: {
            plan_code: selectedPlanCode
        }
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
                    wx.setStorageSync('userInfo', normalizeMembershipCacheUser(res.data));
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
            payment_method: 'ifpay',
            sub_method: 'wechat',
            platform: 'mini_program',
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
