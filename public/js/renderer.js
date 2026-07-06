// NVC Shop & Book Renderer Manager
window.renderer = {
    getProductStatusText(status) {
        if (status === 'available') return 'พร้อมขาย';
        if (status === 'booked') return 'ถูกจองแล้ว';
        if (status === 'sold_out') return 'สินค้าหมด';
        return status;
    },

    renderHome(products) {
        const grid = document.getElementById('products-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (products.length === 0) {
            grid.innerHTML = '<div class="empty-state">ไม่มีสินค้าวางจำหน่ายในขณะนี้</div>';
            return;
        }

        // Sort: Available first, then Booked, then Sold Out
        const sorted = [...products].sort((a, b) => {
            const statusWeight = { 'available': 1, 'booked': 2, 'sold_out': 3 };
            const weightA = statusWeight[a.status] || 9;
            const weightB = statusWeight[b.status] || 9;
            if (weightA !== weightB) {
                return weightA - weightB;
            }
            return b.createdAt - a.createdAt; // Newer first
        });

        sorted.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => window.app.navigateTo(`#/product/${item.id}`);

            const statusText = this.getProductStatusText(item.status);
            const statusClass = item.status; // 'available', 'booked', 'sold_out'

            card.innerHTML = `
                <div class="card-img-wrapper">
                    <img src="${item.images[0] || ''}" class="card-img" alt="${item.name}" loading="lazy">
                    <span class="badge-category">${item.category || 'ทั่วไป'}</span>
                    <span class="badge-time ${statusClass}" style="bottom: 12px; left: 12px;">
                        <span class="status-dot" style="display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; background-color:${item.status === 'available' ? 'var(--secondary)' : (item.status === 'booked' ? 'var(--primary)' : 'var(--danger)')};"></span>
                        <span>${statusText}</span>
                    </span>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${item.name}</h3>
                    <div class="card-bid-info" style="border-bottom: none; margin-bottom: 10px; padding-bottom: 0;">
                        <div>
                            <div class="bid-label">ราคาสินค้า</div>
                            <div class="bid-val" style="color: var(--text-primary); font-size: 20px;">฿${item.price.toLocaleString()}</div>
                        </div>
                        <div style="text-align: right;">
                            <div class="bid-label">คงเหลือ</div>
                            <div class="bid-val" style="color: ${item.stock > 0 ? 'var(--secondary)' : 'var(--danger)'};">
                                ${item.stock > 0 ? `${item.stock} ชิ้น` : 'สินค้าหมด'}
                            </div>
                        </div>
                    </div>
                    <div class="card-footer" style="margin-top: 10px;">
                        <button class="btn ${item.stock > 0 ? 'btn-primary' : 'btn-secondary'}" style="width: 100%; justify-content: center;">
                            ${item.stock > 0 ? 'ดูรายละเอียด / ซื้อจอง' : 'สินค้าหมดชั่วคราว'}
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    renderDetail(item, currentUsername) {
        const container = document.getElementById('detail-container');
        if (!container) return;

        if (!item) {
            container.innerHTML = '<div class="empty-state">ไม่พบข้อมูลสินค้าชิ้นนี้ หรือสินค้าดังกล่าวถูกนำออกไปแล้ว</div>';
            return;
        }

        const isOutOfStock = item.stock <= 0;
        const statusText = this.getProductStatusText(item.status);

        let thumbsHtml = '';
        if (item.images.length > 1) {
            item.images.forEach((img, idx) => {
                thumbsHtml += `<img src="${img}" class="thumb-img ${idx === 0 ? 'active' : ''}" onclick="window.renderer.changeDetailImage(this, '${img}')" alt="รูปภาพสินค้าที่ ${idx + 1}">`;
            });
        }

        let historyHtml = '';
        const orderHistory = item.orders || [];
        if (orderHistory.length > 0) {
            orderHistory.forEach(o => {
                const date = new Date(o.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const typeText = o.type === 'booking' ? 'จองสินค้า' : 'ซื้อทันที';
                const typeColor = o.type === 'booking' ? 'var(--primary)' : 'var(--secondary)';
                
                let statusLabel = 'กำลังรอตรวจสอบ';
                if (o.status === 'confirmed') statusLabel = 'ยืนยันแล้ว';
                if (o.status === 'completed') statusLabel = 'เสร็จสิ้น';
                if (o.status === 'cancelled') statusLabel = 'ยกเลิกแล้ว';

                historyHtml += `
                    <div class="history-item">
                        <span class="bidder">
                            <strong>${o.name}</strong> ${o.name === currentUsername ? '<span style="color:var(--primary); font-size:11px;">(คุณ)</span>' : ''}
                            <span style="margin-left: 8px; padding: 2px 6px; border-radius: 4px; font-size: 11px; color:#fff; background: ${typeColor};">${typeText} (${o.quantity} ชิ้น)</span>
                        </span>
                        <span class="status-badge ${o.status}" style="font-size:11px;">${statusLabel}</span>
                        <span class="time">${date} <span style="font-size:10px; color:var(--text-muted);">(${o.connection || 'ออนไลน์'})</span></span>
                    </div>
                `;
            });
        } else {
            historyHtml = '<div class="empty-state" style="padding: 10px; font-size: 13px;">ยังไม่มีการทำรายการซื้อหรือจองสำหรับสินค้านี้</div>';
        }

        container.innerHTML = `
            <div class="gallery-container">
                <div class="main-img-view">
                    <img id="detail-main-img" src="${item.images[0] || ''}" alt="${item.name}">
                </div>
                <div class="gallery-thumbs">
                    ${thumbsHtml}
                </div>
            </div>
            
            <div class="product-meta">
                <div class="product-header">
                    <span class="badge-category" style="position:static; display:inline-block; margin-bottom: 8px;">${item.category || 'ทั่วไป'}</span>
                    <h1>${item.name}</h1>
                </div>

                <div class="product-desc">${item.description}</div>

                <div class="bid-panel">
                    <div class="time-box ${isOutOfStock ? 'ended' : ''}" id="detail-time-box" style="background: rgba(16, 185, 129, 0.05); border-color: rgba(16, 185, 129, 0.2);">
                        <span class="status-dot" style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${!isOutOfStock ? 'var(--secondary)' : 'var(--danger)'};"></span>
                        <div>
                            <div style="font-size:12px; color:var(--text-secondary);">สถานะสินค้า</div>
                            <div class="time-clock" id="detail-status" style="font-size: 20px;">${statusText} (เหลือสต็อก ${item.stock} ชิ้น)</div>
                        </div>
                    </div>

                    <div class="pricing-panel" style="grid-template-columns: 1fr; margin-bottom: 20px;">
                        <div class="price-card" style="text-align: center;">
                            <div class="bid-label" style="font-size: 14px;">ราคาจำหน่าย</div>
                            <div class="price-num high" id="detail-price" style="font-size: 32px; color: var(--text-primary);">฿${item.price.toLocaleString()}</div>
                        </div>
                    </div>

                    ${!isOutOfStock ? `
                        <div class="bid-form">
                            <div class="input-group">
                                <label for="order-type-select">เลือกประเภทการทำรายการ</label>
                                <select id="order-type-select" class="form-input" style="background-color: var(--bg-base); cursor: pointer;" onchange="window.app.handleOrderTypeChange()">
                                    <option value="purchase">ซื้อสินค้าทันที (Buy Now)</option>
                                    <option value="booking">จองสินค้าล่วงหน้า (Reserve/Book)</option>
                                </select>
                            </div>
                            
                            <div class="input-group" style="margin-top: 10px;">
                                <label for="order-quantity-input">จำนวนสินค้าที่ต้องการ (ชิ้น)</label>
                                <div class="bid-stepper-container">
                                    <div class="stepper-row">
                                        <button class="btn btn-stepper" onclick="window.app.adjustOrderQuantity(-1)">−</button>
                                        <input type="number" id="order-quantity-input" class="form-input bid-input" min="1" max="${item.stock}" value="1">
                                        <button class="btn btn-stepper" onclick="window.app.adjustOrderQuantity(1)">+</button>
                                    </div>
                                    <button class="btn btn-primary btn-bid-submit" id="btn-submit-order" onclick="window.app.placeOrder()" style="background-color: var(--secondary); box-shadow: 0 4px 14px var(--secondary-glow);">
                                        ยืนยันการสั่งซื้อสินค้า
                                    </button>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div style="text-align:center; padding: 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); color: var(--text-primary); font-weight: 600;">
                            ❌ ขออภัย สินค้านี้จำหน่ายหมดแล้วชั่วคราว
                        </div>
                    `}
                </div>

                <div class="history-section">
                    <h4 class="history-title">ประวัติการซื้อและจองสินค้า</h4>
                    <div class="history-list" id="detail-history-list">
                        ${historyHtml}
                    </div>
                </div>
            </div>
        `;
    },

    changeDetailImage(element, src) {
        document.getElementById('detail-main-img').src = src;
        document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active'));
        element.classList.add('active');
    },

    renderAdminDashboard(products, currentUsername) {
        const productTbody = document.getElementById('admin-product-table-body');
        if (productTbody) {
            productTbody.innerHTML = '';

            if (products.length === 0) {
                productTbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 24px; color: var(--text-muted);">ไม่มีรายการสินค้าในระบบ</td></tr>';
            } else {
                products.forEach(item => {
                    const tr = document.createElement('tr');
                    const statusText = this.getProductStatusText(item.status);
                    tr.innerHTML = `
                        <td><img src="${item.images[0] || ''}" class="table-img" alt="${item.name}"></td>
                        <td><strong>${item.name}</strong><br><span style="font-size:11px; color:var(--text-muted);">${item.category}</span></td>
                        <td>฿${item.price.toLocaleString()}</td>
                        <td><span class="status-badge ${item.status}">${statusText}</span></td>
                        <td>${item.stock} ชิ้น</td>
                        <td>${(item.orders || []).length}</td>
                        <td>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-ghost" style="color: var(--danger); padding: 6px 12px; border: 1px solid rgba(239,68,68,0.2);" onclick="window.app.deleteProduct('${item.id}')">ลบสินค้า</button>
                            </div>
                        </td>
                    `;
                    productTbody.appendChild(tr);
                });
            }
        }

        const logsTbody = document.getElementById('admin-logs-table-body');
        if (logsTbody) {
            logsTbody.innerHTML = '';

            let allOrders = [];
            products.forEach(item => {
                if (item.orders) {
                    item.orders.forEach(o => {
                        allOrders.push({
                            orderId: o.id,
                            productId: item.id,
                            productName: item.name,
                            name: o.name,
                            fullname: o.fullname || 'ไม่มีข้อมูลชื่อจริง',
                            contact: o.contact || 'ไม่มีข้อมูลติดต่อ',
                            type: o.type,
                            quantity: o.quantity,
                            status: o.status,
                            timestamp: o.timestamp,
                            connection: o.connection || 'ออนไลน์'
                        });
                    });
                }
            });

            allOrders.sort((a, b) => b.timestamp - a.timestamp);

            if (allOrders.length === 0) {
                logsTbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 24px; color: var(--text-muted);">ไม่มีข้อมูลบันทึกรายการซื้อ/จองในระบบ</td></tr>';
            } else {
                allOrders.forEach(log => {
                    const tr = document.createElement('tr');
                    const time = new Date(log.timestamp).toLocaleString('th-TH');
                    const typeText = log.type === 'booking' ? 'จองสินค้า' : 'ซื้อทันที';
                    const typeStyle = log.type === 'booking' ? 'color:#818cf8; font-weight:600;' : 'color:#34d399; font-weight:600;';
                    
                    let statusLabel = 'รอตรวจสอบ';
                    if (log.status === 'confirmed') statusLabel = 'ยืนยันแล้ว';
                    if (log.status === 'completed') statusLabel = 'เสร็จสิ้น';
                    if (log.status === 'cancelled') statusLabel = 'ยกเลิกแล้ว';

                    let actionsHtml = '';
                    if (log.status === 'pending') {
                        actionsHtml = `
                            <button class="btn btn-ghost" style="color: var(--secondary); padding: 4px 8px; font-size:12px; border: 1px solid rgba(16,185,129,0.2);" onclick="window.app.updateOrderStatus('${log.orderId}', 'confirmed')">ยืนยัน</button>
                            <button class="btn btn-ghost" style="color: var(--danger); padding: 4px 8px; font-size:12px; border: 1px solid rgba(239,68,68,0.2);" onclick="window.app.updateOrderStatus('${log.orderId}', 'cancelled')">ยกเลิก</button>
                        `;
                    } else if (log.status === 'confirmed') {
                        actionsHtml = `
                            <button class="btn btn-ghost" style="color: var(--secondary); padding: 4px 8px; font-size:12px; border: 1px solid rgba(16,185,129,0.2);" onclick="window.app.updateOrderStatus('${log.orderId}', 'completed')">ทำรายการสำเร็จ</button>
                            <button class="btn btn-ghost" style="color: var(--danger); padding: 4px 8px; font-size:12px; border: 1px solid rgba(239,68,68,0.2);" onclick="window.app.updateOrderStatus('${log.orderId}', 'cancelled')">ยกเลิก</button>
                        `;
                    } else {
                        actionsHtml = '<span style="color: var(--text-muted); font-size: 12px;">เรียบร้อยแล้ว</span>';
                    }

                    tr.innerHTML = `
                        <td style="color:var(--text-muted);">${time}</td>
                        <td><a href="#/product/${log.productId}" style="color:var(--text-primary); text-decoration:none; border-bottom: 1px dashed var(--primary);">${log.productName}</a></td>
                        <td><strong>${log.name}</strong><br><span style="font-size:11px; color:var(--text-muted);">${log.fullname}</span></td>
                        <td style="color:var(--primary); font-weight:600;">${log.contact}</td>
                        <td style="${typeStyle}">${typeText}</td>
                        <td style="text-align: center; font-weight:700;">${log.quantity}</td>
                        <td><span class="status-badge ${log.status}" style="font-size:11px;">${statusLabel}</span></td>
                        <td>
                            <div style="display: flex; gap: 4px;">
                                ${actionsHtml}
                            </div>
                        </td>
                    `;
                    logsTbody.appendChild(tr);
                });
            }
        }
    }
};
