// NVC Shop & Book Network Manager (Serverless Google Sheets & Local Storage Fallback)
window.network = {
    isOffline: false,
    onMessageCallback: null,

    init(onMessage) {
        this.onMessageCallback = onMessage;
        this.isOffline = false;
        
        // Initial load
        if (window.app) {
            window.app.handleDatabaseChangedExternal(null, true);
        }
    },

    async callSheets(action, payload = {}) {
        const sheetsUrl = window.db.getSheetsUrl();
        if (!sheetsUrl) {
            throw new Error("No Sheets URL configured");
        }
        try {
            const res = await fetch(sheetsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain' // Avoids CORS preflight OPTIONS request
                },
                body: JSON.stringify({ action, ...payload })
            });
            if (res.ok) {
                return await res.json();
            }
            throw new Error("HTTP Status " + res.status);
        } catch (e) {
            console.error("Sheets POST error:", e);
            throw e;
        }
    },

    async sendRegisterUser(user) {
        const sheetsUrl = window.db.getSheetsUrl();
        if (sheetsUrl && sheetsUrl.trim() !== '') {
            try {
                const res = await this.callSheets('registerUser', { user });
                return res;
            } catch (e) {
                console.error("Sheets register user failed:", e);
                return { error: `ไม่สามารถเชื่อมต่อ Google Sheets ได้: ${e.message}` };
            }
        } else {
            return window.db.registerLocalUser(user);
        }
    },

    async sendLoginUser(username, password) {
        const sheetsUrl = window.db.getSheetsUrl();
        if (sheetsUrl && sheetsUrl.trim() !== '') {
            try {
                const res = await this.callSheets('loginUser', { username, password });
                return res;
            } catch (e) {
                console.error("Sheets login user failed:", e);
                return { error: `ไม่สามารถเชื่อมต่อ Google Sheets ได้: ${e.message}` };
            }
        } else {
            return window.db.loginLocalUser(username, password);
        }
    },

    async sendOrder(productId, type, quantity, timestamp) {
        const sheetsUrl = window.db.getSheetsUrl();
        const payload = {
            productId,
            type, // 'purchase' or 'booking'
            quantity,
            customerName: window.db.getUsername(),
            fullname: window.db.getFullname(),
            contact: window.db.getContact(),
            timestamp,
            connection: 'ออนไลน์'
        };

        const actionText = type === 'booking' ? 'จองสินค้า' : 'สั่งซื้อ';
        
        if (sheetsUrl && sheetsUrl.trim() !== '') {
            if (window.app) window.app.showToast(actionText, `กำลังส่งรายการทำรายการของคุณไปยัง Google Sheets...`, 'info', 2000);
            
            try {
                const orderId = 'ord_' + Date.now();
                const products = await window.db.fetchProducts();
                const product = products.find(p => p.id === productId);
                if (!product) throw new Error("Product not found");
                
                const newStock = product.stock - quantity;
                const newStatus = newStock <= 0 ? (type === 'booking' ? 'booked' : 'sold_out') : 'available';

                const res = await this.callSheets('createOrder', {
                    order: {
                        id: orderId,
                        productId,
                        type,
                        quantity,
                        name: payload.customerName,
                        fullname: payload.fullname,
                        contact: payload.contact,
                        status: 'pending',
                        timestamp,
                        connection: 'ออนไลน์'
                    },
                    productStockUpdate: {
                        id: productId,
                        stock: newStock,
                        status: newStatus
                    }
                });

                if (res && res.success) {
                    if (window.app) {
                        window.app.showToast(actionText + 'สำเร็จ', `บันทึกรายการลง Google Sheet แล้ว`, 'success');
                        await window.app.handleDatabaseChangedExternal(productId, true);
                        window.app.navigateTo('#/');
                    }
                } else {
                    throw new Error(res.error || "Unknown Apps Script error");
                }
            } catch (e) {
                console.error("Sheets order failed:", e);
                if (window.app) window.app.showToast('ข้อผิดพลาด', `การส่งรายการสั่งจองล้มเหลว: ${e.message}`, 'danger');
            }
        } else {
            console.warn("No Sheets URL configured. Saving to local storage instead.");
            const saved = window.db.saveLocalOrder(productId, payload.customerName, type, quantity, payload.fullname, payload.contact, timestamp, 'ออฟไลน์');
            if (saved) {
                if (window.app) {
                    window.app.showToast('บันทึกสำเร็จ (Offline Mode)', `บันทึกรายการลงในเบราว์เซอร์เรียบร้อยแล้ว`, 'warning', 4000);
                    window.app.handleDatabaseChangedExternal(productId, false);
                    window.app.navigateTo('#/');
                }
            } else {
                if (window.app) {
                    window.app.showToast('ทำรายการล้มเหลว', 'สินค้าอาจจะหมดหรือจองเต็มแล้วในระบบบราวเซอร์', 'danger');
                }
            }
        }
    },

    async sendNewProduct(productData) {
        const sheetsUrl = window.db.getSheetsUrl();
        if (sheetsUrl && sheetsUrl.trim() !== '') {
            if (window.app) window.app.showToast('เพิ่มสินค้า', `กำลังบันทึกสินค้าใหม่ลง Google Sheets...`, 'info', 2000);
            try {
                const id = 'prod_' + Date.now();
                const price = parseInt(productData.price || 0, 10);
                const stock = parseInt(productData.stock || 1, 10);
                const status = stock > 0 ? 'available' : 'sold_out';
                
                const newProduct = {
                    id,
                    name: productData.name,
                    category: productData.category || 'ทั่วไป',
                    description: productData.description || '',
                    price,
                    stock,
                    images: productData.images || [],
                    status
                };

                const res = await this.callSheets('addProduct', { product: newProduct });
                if (res && res.success) {
                    if (window.app) {
                        window.app.showToast('เพิ่มสินค้าสำเร็จ', `วางขายสินค้า "${productData.name}" แล้ว`, 'success');
                        window.app.resetAdminForm();
                        await window.app.handleDatabaseChangedExternal(null, true);
                        window.app.navigateTo('#/');
                    }
                } else {
                    throw new Error(res.error || "Unknown Apps Script error");
                }
            } catch (e) {
                console.error("Sheets add product failed:", e);
                if (window.app) window.app.showToast('ข้อผิดพลาด', `ล้มเหลว: ${e.message}`, 'danger');
            }
        } else {
            const newProd = window.db.saveLocalProduct(productData);
            if (newProd) {
                if (window.app) {
                    window.app.showToast('เพิ่มสินค้าสำเร็จ (Offline Mode)', `เพิ่มสินค้า "${productData.name}" ลงบราวเซอร์แล้ว`, 'warning', 4000);
                    window.app.resetAdminForm();
                    window.app.handleDatabaseChangedExternal(null, false);
                    window.app.navigateTo('#/');
                }
            }
        }
    },

    async sendDeleteProduct(id) {
        const sheetsUrl = window.db.getSheetsUrl();
        if (sheetsUrl && sheetsUrl.trim() !== '') {
            if (window.app) window.app.showToast('ลบสินค้า', `กำลังลบสินค้าใน Google Sheets...`, 'info', 2000);
            try {
                const res = await this.callSheets('deleteProduct', { id });
                if (res && res.success) {
                    if (window.app) {
                        window.app.showToast('ลบสำเร็จ', 'ลบสินค้าออกจากสเปรดชีตแล้ว', 'success');
                        await window.app.handleDatabaseChangedExternal(null, true);
                    }
                } else {
                    throw new Error(res.error || "Unknown Apps Script error");
                }
            } catch (e) {
                console.error("Sheets delete product failed:", e);
                if (window.app) window.app.showToast('ข้อผิดพลาด', `ลบสินค้าล้มเหลว: ${e.message}`, 'danger');
            }
        } else {
            window.db.deleteLocalProduct(id);
            if (window.app) {
                window.app.showToast('ลบสินค้าสำเร็จ (Offline Mode)', 'ลบสินค้าออกจากบราวเซอร์แล้ว', 'warning', 4000);
                window.app.handleDatabaseChangedExternal(null, false);
            }
        }
    },

    async sendUpdateOrderStatus(orderId, status) {
        const sheetsUrl = window.db.getSheetsUrl();
        if (sheetsUrl && sheetsUrl.trim() !== '') {
            if (window.app) window.app.showToast('อัปเดตออเดอร์', `กำลังเปลี่ยนสถานะใน Google Sheets...`, 'info', 2000);
            try {
                // Find order and product to compute stock adjustments
                const products = await window.db.fetchProducts();
                let foundOrder = null;
                let foundProduct = null;
                for (const p of products) {
                    const o = (p.orders || []).find(ord => ord.id === orderId);
                    if (o) {
                        foundOrder = o;
                        foundProduct = p;
                        break;
                    }
                }

                if (!foundOrder || !foundProduct) throw new Error("Order or Product not found");
                
                const oldStatus = foundOrder.status;
                let newStock = foundProduct.stock;
                let newStatus = foundProduct.status;

                // Stock recovery logic
                if (status === 'cancelled' && oldStatus !== 'cancelled') {
                    newStock += foundOrder.quantity;
                    if (newStock > 0) newStatus = 'available';
                }
                if (oldStatus === 'cancelled' && status !== 'cancelled') {
                    newStock = Math.max(0, newStock - foundOrder.quantity);
                    if (newStock <= 0) {
                        newStatus = foundOrder.type === 'booking' ? 'booked' : 'sold_out';
                    }
                }

                const res = await this.callSheets('updateOrderStatus', {
                    orderId,
                    status,
                    productStockUpdate: {
                        id: foundProduct.id,
                        stock: newStock,
                        status: newStatus
                    }
                });

                if (res && res.success) {
                    if (window.app) {
                        window.app.showToast('สำเร็จ', 'อัปเดตสถานะออเดอร์แล้ว', 'success');
                        await window.app.handleDatabaseChangedExternal(null, true);
                    }
                } else {
                    throw new Error(res.error || "Unknown Apps Script error");
                }
            } catch (e) {
                console.error("Sheets update order status failed:", e);
                if (window.app) window.app.showToast('ข้อผิดพลาด', `อัปเดตล้มเหลว: ${e.message}`, 'danger');
            }
        } else {
            const updated = window.db.updateLocalOrderStatus(orderId, status);
            if (updated && window.app) {
                window.app.showToast('อัปเดตสถานะสำเร็จ (Offline Mode)', 'บันทึกออเดอร์ในบราวเซอร์แล้ว', 'warning', 4000);
                window.app.handleDatabaseChangedExternal(null, false);
            }
        }
    },

    async sendDatabaseSync(data) {
        const sheetsUrl = window.db.getSheetsUrl();
        if (sheetsUrl && sheetsUrl.trim() !== '') {
            if (window.app) window.app.showToast('ซิงค์ข้อมูล', `กำลังซิงค์ไปยัง Google Sheets...`, 'info', 2000);
            try {
                const flatProducts = data.map(p => {
                    const { orders, ...rest } = p;
                    return rest;
                });
                const flatOrders = [];
                data.forEach(p => {
                    (p.orders || []).forEach(o => {
                        flatOrders.push(o);
                    });
                });

                const res = await this.callSheets('syncDatabase', { products: flatProducts, orders: flatOrders });
                if (res && res.success) {
                    if (window.app) {
                        window.app.showToast('สำเร็จ', 'ซิงค์ข้อมูลลง Google Sheets เรียบร้อย', 'success');
                        await window.app.handleDatabaseChangedExternal(null, true);
                    }
                } else {
                    throw new Error(res.error || "Unknown Apps Script error");
                }
            } catch (e) {
                console.error("Sheets sync failed:", e);
                if (window.app) window.app.showToast('ข้อผิดพลาด', `ซิงค์ฐานข้อมูลล้มเหลว: ${e.message}`, 'danger');
            }
        } else {
            window.db.saveLocalProducts(data);
            if (window.app) {
                window.app.showToast('สำเร็จ (Offline Mode)', 'นำเข้าข้อมูลลงบราวเซอร์เรียบร้อย', 'warning', 4000);
                window.app.handleDatabaseChangedExternal(null, false);
            }
        }
    },

};
