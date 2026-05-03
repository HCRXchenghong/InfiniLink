const mixins = require('../../../mixins/user')
const common = require('../../../mixins/common')
const app = getApp()

import NumberAnimate from "../../../utils/numberAnimate";

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    tabData: ["收益记录", "提现记录"],
    swithBarIndex: 0,
    withdrawalPopup: false,
    idx: -1,
    withdrawalPrice: [10, 50, 100, 200],
    price: 0,
    withdrawalBalance: 0,
    bankName: '',
    bankId: '',
    sumPrice: "0",
    withdrawal: [{
        n: '昨日收益',
        i: '0'
      },
      {
        n: '可提现',
        i: '0'
      },
      {
        n: '已提现',
        i: '0'
      },
    ],
    withdrawalList: [],
    isWithdrawal: true,
    exceptionalList: [],
    isExceptional: true,
  },


  //切换
  onHandleClick: function (e) {
    let that = this;
    const index = e.currentTarget.dataset.index;
    that.setData({
      swithBarIndex: index,
    })
    if (index == 0) {
      this.myUserExceptional();
    } else if (index == 1) {
      this.myUserWithdrawal();
    }
  },

  withdrawalTap() {
    let that = this;
    that.setData({
      withdrawalPopup: !that.data.withdrawalPopup
    })
  },

  addwithdrawalPrice(e) {
    let price = e.currentTarget.dataset.price;
    let idx = e.currentTarget.dataset.idx;
    let that = this;
    that.setData({
      price: price,
      idx: idx,
    })
  },

  withdrawalbankName(e) {
    this.setData({
      bankName: e.detail.value
    })
  },

  withdrawalbankId(e) {
    this.setData({
      bankId: e.detail.value
    })
  },

  notWithdrawal(e) {
    let price = e.currentTarget.dataset.price;
    wx.showToast({
      title: '可提现金额不足¥' + price + ' !',
      icon: 'none',
      duration: 1500
    })
  },

  animate: function () {
    let that = this;
    let sumPrice = that.data.sumPrice;
    let number = new NumberAnimate({
      from: sumPrice,
      speed: 1500,
      refreshTime: 100,
      decimals: 2,
      onUpdate: () => {
        that.setData({
          sumPrice: number.tempValue
        });
      },
    });
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.myFinancial();
    this.myUserExceptional();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.myFinancial();
    that.myUserWithdrawal();
    wx.hideNavigationBarLoading();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
}

common(options)
mixins(options)
Page(options)