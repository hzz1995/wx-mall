const api = require('../../utils/api')
const {
  getToken,
  getUser,
  saveSession,
  requireLogin
} = require('../../utils/session')

Page({
  data: {
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    saving: false
  },

  onLoad() {
    if (!getToken()) {
      requireLogin('/pages/password/index')
    }
  },

  onOldInput(event) {
    this.setData({ oldPassword: event.detail.value })
  },

  onNewInput(event) {
    this.setData({ newPassword: event.detail.value })
  },

  onConfirmInput(event) {
    this.setData({ confirmPassword: event.detail.value })
  },

  async submit() {
    if (this.data.saving) return
    if (!this.data.oldPassword) {
      wx.showToast({ title: '请输入原密码', icon: 'none' })
      return
    }
    if (this.data.newPassword.length < 6) {
      wx.showToast({ title: '新密码至少 6 位', icon: 'none' })
      return
    }
    if (this.data.newPassword !== this.data.confirmPassword) {
      wx.showToast({ title: '两次输入的新密码不一致', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const data = await api.call('changePassword', {
        oldPassword: this.data.oldPassword,
        newPassword: this.data.newPassword
      })
      if (data.token) {
        saveSession(data.token, getUser())
      }
      wx.showToast({ title: '密码已修改', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (err) {
      this.setData({ saving: false })
      api.toastError(err)
    }
  }
})
