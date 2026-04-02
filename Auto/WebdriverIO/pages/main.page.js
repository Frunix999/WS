class MainPage {

    get forumBtn() { return $('a[href="https://dou.ua/forums/"]') }
    get bandBtn() { return $('a[href="https://dou.ua/lenta/"]') }
    get salariesBtn() { return $('a[href="https://jobs.dou.ua/salaries/"]') }
    get searchInput() { return $('#txtGlobalSearch') }
    get gameDevBtn() { return $('.menu-site__gamedev') }
    get relocateBtn() { return $('.menu-site__relocate') }

    async clickOnForumBtn() {
        await this.forumBtn.click()
    }

    async clickOnBandBtn() {
        await this.bandBtn.click()
    }

    async clickOnGameDevBtn() {
        await this.gameDevBtn.click()
    }

    async setSearchInput(value) {
        await this.searchInput.addValue(value)
    }
}


export default new MainPage()