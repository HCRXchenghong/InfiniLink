const mixins = require('../../../mixins/user')
const app = getApp()

function decodeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function buildSupportEntry(scene) {
  switch (scene) {
    case 'max_post':
      return {
        title: 'Max 内容提报入口',
        desc: '这里可以提交当前帖子对应的专题提报、运营协助或内容支持需求。'
      };
    case 'max_circle':
      return {
        title: 'Max 圈子支持入口',
        desc: '这里可以提交圈子合作、专题活动、运营协助和优先客服需求。'
      };
    case 'max_mine':
      return {
        title: 'Max 专属支持入口',
        desc: '这里可以直接发起会员权益咨询、账号支持和优先处理申请。'
      };
    default:
      return {
        title: '',
        desc: ''
      };
  }
}

const options = {


  /**
   * 页面的初始数据
   */
  data: {
    descMaxLength: 1000,
    descLength: 0,
    nameLength: 0,
    index: 0,
    cats: ['功能问题', '其他问题'],
    feedback_type: 0,
    feedback_content: "",
    type: 'forum',
    supportEntryTitle: '',
    supportEntryDesc: '',
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let supportEntry = buildSupportEntry(decodeText(options.scene));
    let feedbackType = Number(options.type);
    let safeIndex = feedbackType >= 0 && feedbackType < this.data.cats.length ? feedbackType : 0;
    let feedbackContent = decodeText(options.prefill);
    this.setData({
      index: safeIndex,
      feedback_type: safeIndex,
      feedback_content: feedbackContent,
      descLength: feedbackContent.length,
      supportEntryTitle: supportEntry.title,
      supportEntryDesc: supportEntry.desc,
    })
  },

  onInputChange: function (t) {
    var a = t.currentTarget.dataset.type,
      o = t.detail.value;
    if (2 == a) this.setData({
      feedback_content: o,
      descLength: o.length
    });
  },

  bindPickerChange: function (e) {
    let value = Number(e.detail.value || 0);
    this.setData({
      index: value,
      feedback_type: value,
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
}

mixins(options)
Page(options)
