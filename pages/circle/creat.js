const mixins = require('../../mixins/circle')
const common = require('../../mixins/common')
const app = getApp()
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    notice: true,
    descMaxLength: 200,
    nameMaxLength: 50,
    descLength: 0,
    nameLength: 0,
    index: 0,
    cats: [],
    circleName: "",
    circleDesc: "",
    imageSubject: null,
    imageAvatar: null,
    type: '',
    protocolChecked: false,
    tisi: "创建圈子前请先联系轻航官方获取更多圈子规范和建议，可大大提升通过率。",
    imageAvatarClipper: false,
    imagesubjectClipper: false,
    pic: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.geToptionsList();
    let title = '创建圈子';
    let id = '';
    let tisi = this.data.tisi;
    if (options.type == 1) {
      title = '编辑';
      tisi = "编辑圈子请保证信息符合相关规定及条款，如有违规信息一经发现圈子可能会面临注销的风险。";
      id = options.id;
      this.editorCircleInfo(options.id);
    }
    this.setData({
      id: id,
      tisi: tisi,
      type: options.type
    })
    wx.setNavigationBarTitle({
      title: title
    })
  },

  clipperImage: function (e) {
    this.imageClipper(e.currentTarget.dataset.type);
  },

  addimage: function (e) {
    this.uploadPicturesPic(e.detail.url, e.currentTarget.dataset.name, e.currentTarget.dataset.type);
  },

  delimage: function (e) {
    let name = e.currentTarget.dataset.name;
    this.setData({
      [name]: null
    })
  },

  onInputChangeCircle: function (e) {
    var type = e.currentTarget.dataset.type,
      value = e.detail.value;
    if (type == 1) this.setData({
      circleName: value,
      nameLength: value.length
    });
    else if (type == 2) this.setData({
      circleDesc: value,
      descLength: value.length
    });
  },

  bindPickerChange: function (e) {
    this.setData({
      index: e.detail.value,
      parent: this.data.cats[e.detail.value].id,
    })
  },

  onProtocolChange: function () {
    this.setData({
      protocolChecked: !this.data.protocolChecked
    })
  },

  onProtocolClick: function () {
    wx.navigateTo({
      url: '/pages/clause/clause?type=20',
    })
  },

}
common(options)
mixins(options)
Page(options)