/**
 * Retention Dashboard - Desk Page Version
 *
 * This Desk page embeds the full www/retention-dashboard page in an iframe
 * for seamless integration into the Frappe Desk sidebar.
 */

frappe.pages['retention-dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Retention Dashboard',
        single_column: true
    });

    // Remove default padding for full-width iframe
    page.main.css({
        'padding': '0',
        'margin': '0'
    });

    // Create iframe container
    const iframe_container = $(`
        <div class="retention-dashboard-iframe-container" style="
            width: 100%;
            height: calc(100vh - 120px);
            border: none;
            overflow: hidden;
        ">
            <iframe
                id="retention-dashboard-iframe"
                src="/retention-dashboard"
                style="
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                "
                frameborder="0"
            ></iframe>
        </div>
    `);

    page.main.html(iframe_container);

    // Optional: Add refresh button in page header
    page.add_inner_button(__('Refresh'), function() {
        document.getElementById('retention-dashboard-iframe').contentWindow.location.reload();
    }, 'fa fa-refresh');

    // Optional: Add "Open in New Tab" button
    page.add_inner_button(__('Open in New Tab'), function() {
        window.open('/retention-dashboard', '_blank');
    }, 'fa fa-external-link');

    // Handle iframe load events
    const iframe = document.getElementById('retention-dashboard-iframe');

    iframe.addEventListener('load', function() {
        console.log('Retention Dashboard loaded in Desk page');

        // Optional: Sync iframe height with content
        try {
            const iframeContent = iframe.contentWindow.document.body;
            iframe.style.height = iframeContent.scrollHeight + 'px';
        } catch (e) {
            // Cross-origin restrictions may prevent this
            console.log('Cannot access iframe content for height sync');
        }
    });

    // Handle communication from iframe (if needed)
    window.addEventListener('message', function(event) {
        // Handle messages from the embedded dashboard
        if (event.data && event.data.type === 'retention-dashboard') {
            console.log('Message from Retention Dashboard:', event.data);
        }
    });
};

// Cleanup when page is unloaded
frappe.pages['retention-dashboard'].on_page_show = function(wrapper) {
    // Refresh iframe on page show
    const iframe = document.getElementById('retention-dashboard-iframe');
    if (iframe && iframe.src) {
        console.log('Retention Dashboard page shown');
    }
};
