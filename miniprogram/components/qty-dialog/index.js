Component({
  properties: {
    show: { type: Boolean, value: false },
    product: { type: Object, value: {} },
    initialQty: { type: Number, value: 1 }
  },

  data: {
    quantity: 1,
    quantityText: '1'
  },

  observers: {
    'show, initialQty': function (show, initialQty) {
      if (!show) return
      const quantity = this.clamp(initialQty)
      this.setData({ quantity, quantityText: String(quantity) })
    }
  },

  methods: {
    clamp(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return 1
      return Math.min(99, Math.max(1, Math.floor(number)))
    },

    noop() {},

    close() {
      this.triggerEvent('close')
    },

    increase() {
      const quantity = Math.min(99, this.clamp(this.data.quantityText) + 1)
      this.setData({ quantity, quantityText: String(quantity) })
    },

    decrease() {
      const quantity = Math.max(1, this.clamp(this.data.quantityText) - 1)
      this.setData({ quantity, quantityText: String(quantity) })
    },

    onInput(event) {
      const text = event.detail.value
      this.setData({
        quantityText: text,
        quantity: this.clamp(text)
      })
    },

    onBlur() {
      const quantity = this.clamp(this.data.quantityText)
      this.setData({ quantity, quantityText: String(quantity) })
    },

    confirm() {
      const quantity = this.clamp(this.data.quantityText)
      this.setData({ quantity, quantityText: String(quantity) })
      this.triggerEvent('confirm', { quantity })
    }
  }
})
